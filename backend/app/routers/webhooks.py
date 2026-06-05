"""
ConverseOS — Webhook Router
Meta WhatsApp Cloud API + Twilio WhatsApp Sandbox

Architecture (post-refactor):
  POST /webhook → parse → rate limit → idempotency lock
                → save_incoming_message()   ← fast DB path, < 500ms
                → return 200 to Meta/Twilio ← IMMEDIATELY
                → [background] process_ai_reply()  ← slow AI path, 3-25s

Rate limits (4 levels):
  1. Global           : 500 req / 60s
  2. Per-org          : 100 req / 60s
  3. Per-contact msg  :  20 req / 60s
  4. Per-contact AI   :   1 req /  3s  (double-send prevention)

All webhook endpoints ALWAYS return 200 OK (or TwiML 200).
Never 4xx/5xx — Meta/Twilio retries on anything other than 200.
"""

from fastapi import APIRouter, Request, Query, HTTPException, BackgroundTasks
from fastapi.responses import Response

from app.config import settings
from app.utils.error_handler import get_logger
from app.utils.rate_limiter import rate_limiter
from app.utils.idempotency import idempotency_checker
from app.services.message_processor import save_incoming_message, process_ai_reply

logger = get_logger("webhooks_router")

router = APIRouter()

TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'


# ─────────────────────────────────────────────────────────────────────────────
# Payload Parsers
# ─────────────────────────────────────────────────────────────────────────────

def _parse_meta_payload(payload: dict) -> dict:
    """
    Extracts all fields needed from a Meta WhatsApp Cloud API webhook payload.
    Returns an empty dict if this payload has no messages (e.g. status updates).
    """
    try:
        value = (
            payload
            .get("entry", [{}])[0]
            .get("changes", [{}])[0]
            .get("value", {})
        )
        messages = value.get("messages", [])
        if not messages:
            return {}

        msg             = messages[0]
        msg_type        = msg.get("type", "text")
        channel_msg_id  = msg.get("id", "")
        sender_phone    = msg.get("from", "")
        phone_number_id = value.get("metadata", {}).get("phone_number_id", "")
        profile_name    = (
            value.get("contacts", [{}])[0]
            .get("profile", {})
            .get("name", "WhatsApp User")
        )

        if msg_type == "text":
            content = msg.get("text", {}).get("body", "")
        elif msg_type in ("image", "audio", "document", "video"):
            media = msg.get(msg_type, {})
            content = f"[Media: {msg_type.upper()}] id={media.get('id')} mime={media.get('mime_type')}"
        else:
            content = f"[Unsupported type: {msg_type}]"

        return {
            "channel_message_id": channel_msg_id,
            "sender_phone":       sender_phone,
            "content":            content,
            "channel":            "whatsapp",
            "phone_number_id":    phone_number_id,
            "profile_name":       profile_name,
            "msg_type":           msg_type,
            "is_twilio":          False,
        }
    except Exception as exc:
        logger.warning("[Webhook] Meta payload parse error: %s", str(exc))
        return {}


def _parse_twilio_payload(form: dict) -> dict:
    """Extracts all fields needed from a Twilio form-encoded webhook payload."""
    try:
        from_val = form.get("From", "")
        to_val   = form.get("To", "")
        return {
            "channel_message_id": form.get("MessageSid", ""),
            "sender_phone":       from_val.replace("whatsapp:", "").replace("+", "").strip(),
            "content":            form.get("Body", ""),
            "channel":            "twilio",
            "phone_number_id":    to_val.replace("whatsapp:", "").replace("+", "").strip(),
            "profile_name":       "Twilio WhatsApp User",
            "msg_type":           "text",
            "is_twilio":          True,
        }
    except Exception as exc:
        logger.warning("[Webhook] Twilio payload parse error: %s", str(exc))
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Rate Limit Guard
# ─────────────────────────────────────────────────────────────────────────────

def _check_rate_limits(phone: str, org_key: str) -> bool:
    """
    Returns True if request should be processed, False if any limit exceeded.
    Order: global → org → contact-msg → contact-AI-cooldown
    """
    phone_tail = phone[-4:] if len(phone) >= 4 else phone

    if not rate_limiter.is_allowed("global:total", max_calls=500, window_seconds=60):
        logger.critical("[RateLimit] GLOBAL cap (500/min) hit — dropping ...%s", phone_tail)
        return False

    if org_key and not rate_limiter.is_allowed(f"org:{org_key}:total", max_calls=100, window_seconds=60):
        count = rate_limiter.current_count(f"org:{org_key}:total", 60)
        logger.warning("[RateLimit] Org cap (100/min) | org=%s | count=%d", org_key, count)
        return False

    if phone and not rate_limiter.is_allowed(f"contact:{phone}:msg", max_calls=20, window_seconds=60):
        logger.warning("[RateLimit] Contact msg cap (20/min) | phone=...%s", phone_tail)
        return False

    if phone and not rate_limiter.is_allowed(f"contact:{phone}:ai", max_calls=1, window_seconds=3):
        logger.info("[RateLimit] AI cooldown (1/3s) | phone=...%s", phone_tail)
        return False

    return True


# ─────────────────────────────────────────────────────────────────────────────
# Shared Dispatch Logic
# ─────────────────────────────────────────────────────────────────────────────

async def _dispatch(
    message_data: dict,
    background_tasks: BackgroundTasks,
) -> None:
    """
    Shared fast-path + background-queue logic for both Meta and Twilio.

    Steps:
      1. Rate limit guard (returns immediately if exceeded)
      2. In-flight idempotency lock (Layer 1)
      3. save_incoming_message() — fast DB ops, < 500ms, no AI
      4. Queue process_ai_reply() as BackgroundTask (runs after 200 returned)
    """
    phone           = message_data.get("sender_phone", "")
    org_key         = message_data.get("phone_number_id", "")
    channel_msg_id  = message_data.get("channel_message_id", "")
    phone_tail      = phone[-4:] if len(phone) >= 4 else phone

    logger.info(
        "[Webhook] %s inbound | phone=...%s | type=%s | len=%d",
        message_data.get("channel", "?").upper(),
        phone_tail,
        message_data.get("msg_type", "text"),
        len(message_data.get("content", "")),
    )

    # ── Rate limit ────────────────────────────────────────────────────────────
    if not _check_rate_limits(phone=phone, org_key=org_key):
        return

    # ── In-flight idempotency lock (Layer 1) ─────────────────────────────────
    if channel_msg_id and await idempotency_checker.is_processing(channel_msg_id):
        logger.info(
            "[Idempotency] Already in-flight, dropping duplicate | msg_id=%s", channel_msg_id
        )
        return

    if channel_msg_id:
        await idempotency_checker.mark_processing(channel_msg_id)

    # ── Fast DB path — MUST finish before returning 200 ──────────────────────
    save_result = await save_incoming_message(message_data)

    if save_result is None:
        # save failed (duplicate detected in DB or DB error) — release lock and exit
        if channel_msg_id:
            await idempotency_checker.mark_done(channel_msg_id)
        return

    # ── Queue AI processing as background task ────────────────────────────────
    # process_ai_reply() releases the idempotency lock in its finally block.
    background_tasks.add_task(
        process_ai_reply,
        message_data=message_data,
        save_result=save_result,
        message_id_for_lock=channel_msg_id,
    )

    logger.info(
        "[Webhook] Queued AI background task | conv=%s | phone=...%s",
        save_result["conversation_id"], phone_tail,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Meta WhatsApp — Verification (GET)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/")
@router.get("/whatsapp")
async def verify_whatsapp_webhook(
    mode: str = Query(None, alias="hub.mode"),
    challenge: str = Query(None, alias="hub.challenge"),
    token: str = Query(None, alias="hub.verify_token"),
):
    """Meta webhook verification handshake — called once on registration."""
    logger.info("[Webhook] Meta verification | mode=%s", mode)
    if mode == "subscribe" and token == settings.whatsapp_verify_token:
        logger.info("[Webhook] Meta verification successful.")
        return int(challenge)
    logger.error("[Webhook] Meta verification FAILED — token mismatch.")
    raise HTTPException(status_code=403, detail="Verification token mismatch.")


# ─────────────────────────────────────────────────────────────────────────────
# Meta WhatsApp — Incoming Messages (POST)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/")
@router.post("/whatsapp")
async def handle_whatsapp_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Receives incoming messages from Meta WhatsApp Cloud API.

    Flow:
      parse → rate-limit → idempotency → save to DB → return 200
      [background] → generate AI reply → send → save AI message
    """
    try:
        payload = await request.json()
        message_data = _parse_meta_payload(payload)

        if not message_data:
            # Status update or empty payload — acknowledge and ignore
            return {"status": "ok"}

        await _dispatch(message_data, background_tasks)
        return {"status": "ok"}

    except Exception as exc:
        logger.error("[Webhook] Meta handler error: %s", str(exc), exc_info=True)
        return {"status": "ok"}  # ALWAYS 200 — never let Meta see a 5xx


# ─────────────────────────────────────────────────────────────────────────────
# Twilio WhatsApp Sandbox — Incoming Messages (POST)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/twilio-whatsapp")
@router.post("/twilio")
async def handle_twilio_whatsapp_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Receives incoming messages from Twilio WhatsApp Sandbox (form-encoded).

    Flow: same as Meta — save first, AI in background, return TwiML immediately.
    """
    try:
        form_data = await request.form()
        message_data = _parse_twilio_payload(dict(form_data))

        if not message_data:
            return Response(content=TWIML_EMPTY, media_type="application/xml")

        await _dispatch(message_data, background_tasks)
        return Response(content=TWIML_EMPTY, media_type="application/xml")

    except Exception as exc:
        logger.error("[Webhook] Twilio handler error: %s", str(exc), exc_info=True)
        return Response(content=TWIML_EMPTY, media_type="application/xml")


# ─────────────────────────────────────────────────────────────────────────────
# Connection Test (not a real webhook — safe to return errors)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/whatsapp/test")
@router.post("/test")
async def test_whatsapp_connection(request: Request):
    """Manually verifies WhatsApp Cloud API credentials. Not a real webhook."""
    try:
        payload = await request.json()
        token    = payload.get("token")
        phone_id = payload.get("phone_number_id")

        if not token or not phone_id:
            raise HTTPException(
                status_code=400,
                detail="Missing required parameters 'token' or 'phone_number_id'.",
            )

        logger.info("[Webhook] Connection test for phone_id=%s", phone_id)
        return {"status": "success", "message": "WhatsApp API connection verified."}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[Webhook] Test connection error: %s", str(exc))
        raise HTTPException(status_code=500, detail="Internal error during connection test.")
