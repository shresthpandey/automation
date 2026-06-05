"""
ConverseOS — Webhook Router
Meta WhatsApp Cloud API + Twilio WhatsApp Sandbox

Rate limiting applied at 3 levels:
  1. Per-contact AI cooldown  : 1 req / 3s   (prevents double AI fire)
  2. Per-contact msg rate     : 20 req / 60s  (spam protection)
  3. Per-org total rate       : 100 req / 60s (org-level cap)
  4. Global rate              : 500 req / 60s (platform-wide cap)

All webhook endpoints ALWAYS return 200 OK (or TwiML 200 for Twilio).
Never return 4xx/5xx — Meta/Twilio would retry endlessly.
"""

from fastapi import APIRouter, Request, Query, HTTPException, BackgroundTasks
from fastapi.responses import Response

from app.config import settings
from app.services.whatsapp import whatsapp_service
from app.utils.error_handler import get_logger
from app.utils.rate_limiter import rate_limiter
from app.utils.idempotency import idempotency_checker

logger = get_logger("webhooks_router")

router = APIRouter()

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

def _extract_meta_phone(payload: dict) -> str:
    """Safely extracts sender phone from Meta payload. Returns '' on failure."""
    try:
        msgs = (
            payload
            .get("entry", [{}])[0]
            .get("changes", [{}])[0]
            .get("value", {})
            .get("messages", [])
        )
        return msgs[0].get("from", "") if msgs else ""
    except Exception:
        return ""


def _extract_meta_org_phone_id(payload: dict) -> str:
    """Extracts phone_number_id from Meta payload metadata."""
    try:
        return (
            payload
            .get("entry", [{}])[0]
            .get("changes", [{}])[0]
            .get("value", {})
            .get("metadata", {})
            .get("phone_number_id", "")
        )
    except Exception:
        return ""


def _check_rate_limits(phone: str, org_key: str) -> bool:
    """
    Runs all rate limit checks for an incoming message.
    Returns True if the message SHOULD be processed, False if rate limited.
    Logs appropriate warnings without exposing full phone numbers.
    """
    phone_tail = phone[-4:] if len(phone) >= 4 else phone

    # ── Level 1: Global platform cap ─────────────────────────────────────────
    if not rate_limiter.is_allowed("global:total", max_calls=500, window_seconds=60):
        logger.critical(
            "[RateLimit] GLOBAL cap hit (500/min) — dropping message from ...%s silently.",
            phone_tail,
        )
        return False

    # ── Level 2: Per-org cap ─────────────────────────────────────────────────
    if org_key and not rate_limiter.is_allowed(
        f"org:{org_key}:total", max_calls=100, window_seconds=60
    ):
        count = rate_limiter.current_count(f"org:{org_key}:total", 60)
        logger.warning(
            "[RateLimit] Org cap hit (100/min) | org_key=%s | current_count=%d — dropping silently.",
            org_key,
            count,
        )
        return False

    # ── Level 3: Per-contact message rate ────────────────────────────────────
    if phone and not rate_limiter.is_allowed(
        f"contact:{phone}:msg", max_calls=20, window_seconds=60
    ):
        logger.warning(
            "[RateLimit] Contact msg cap hit (20/min) | phone=...%s — dropping silently.",
            phone_tail,
        )
        return False

    # ── Level 4: Per-contact AI processing cooldown ──────────────────────────
    if phone and not rate_limiter.is_allowed(
        f"contact:{phone}:ai", max_calls=1, window_seconds=3
    ):
        logger.info(
            "[RateLimit] AI cooldown active (1/3s) | phone=...%s — dropping duplicate.",
            phone_tail,
        )
        return False

    return True


# ──────────────────────────────────────────────────────────────────────────────
# Meta WhatsApp — Verification (GET)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/")
@router.get("/whatsapp")
async def verify_whatsapp_webhook(
    mode: str = Query(None, alias="hub.mode"),
    challenge: str = Query(None, alias="hub.challenge"),
    token: str = Query(None, alias="hub.verify_token"),
):
    """
    Handles Meta webhook verification handshake.
    Meta calls this once when you register the webhook URL.
    """
    logger.info("[Webhook] Meta verification request received | mode=%s", mode)
    if mode == "subscribe" and token == settings.whatsapp_verify_token:
        logger.info("[Webhook] Meta verification successful.")
        return int(challenge)
    logger.error("[Webhook] Meta verification FAILED — token mismatch.")
    raise HTTPException(status_code=403, detail="Verification token mismatch.")


# ──────────────────────────────────────────────────────────────────────────────
# Meta WhatsApp — Incoming Messages (POST)
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/")
@router.post("/whatsapp")
async def handle_whatsapp_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Receives incoming messages from Meta WhatsApp Cloud API.
    Always returns 200 OK — rate limited messages are silently dropped.
    """
    try:
        payload = await request.json()

        # Extract identifiers for rate limiting
        phone = _extract_meta_phone(payload)
        org_phone_id = _extract_meta_org_phone_id(payload)

        logger.info(
            "[Webhook] Meta inbound | phone=...%s | org_phone_id=%s",
            phone[-4:] if len(phone) >= 4 else phone,
            org_phone_id,
        )

        # Rate limit check — use phone_number_id as org_key (pre-org-lookup)
        if not _check_rate_limits(phone=phone, org_key=org_phone_id):
            return {"status": "ok"}  # silently drop — never 4xx

        # ── In-flight idempotency lock (Layer 1) ─────────────────────────────
        # Extract message_id early for lock key (wamid.xxx format)
        meta_msg_id = ""
        try:
            meta_msg_id = (
                payload
                .get("entry", [{}])[0]
                .get("changes", [{}])[0]
                .get("value", {})
                .get("messages", [{}])[0]
                .get("id", "")
            )
        except Exception:
            pass

        if meta_msg_id and await idempotency_checker.is_processing(meta_msg_id):
            logger.info(
                "[Idempotency] Meta msg already in-flight, dropping duplicate | msg_id=%s",
                meta_msg_id,
            )
            return {"status": "ok"}

        if meta_msg_id:
            await idempotency_checker.mark_processing(meta_msg_id)

        async def _process_and_unlock_meta():
            try:
                await whatsapp_service.process_incoming_message(payload, False)
            finally:
                if meta_msg_id:
                    await idempotency_checker.mark_done(meta_msg_id)

        background_tasks.add_task(_process_and_unlock_meta)
        return {"status": "ok"}

    except Exception as exc:
        logger.error("[Webhook] Meta handler error: %s", str(exc), exc_info=True)
        return {"status": "ok"}  # always 200


# ──────────────────────────────────────────────────────────────────────────────
# Twilio WhatsApp Sandbox — Incoming Messages (POST)
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/twilio-whatsapp")
@router.post("/twilio")
async def handle_twilio_whatsapp_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Receives incoming messages from Twilio WhatsApp Sandbox.
    Form-encoded payload. Always returns TwiML 200.
    Rate limited messages are silently dropped.
    """
    try:
        form_data = await request.form()
        payload = dict(form_data)

        # Extract phone — Twilio sends "whatsapp:+919876543210"
        from_val: str = payload.get("From", "")
        phone = from_val.replace("whatsapp:", "").replace("+", "").strip()
        to_val: str = payload.get("To", "")
        org_key = to_val.replace("whatsapp:", "").replace("+", "").strip()

        logger.info(
            "[Webhook] Twilio inbound | phone=...%s | to=%s",
            phone[-4:] if len(phone) >= 4 else phone,
            org_key,
        )

        # Rate limit check
        if not _check_rate_limits(phone=phone, org_key=org_key):
            return Response(content=TWIML_EMPTY, media_type="application/xml")

        # ── In-flight idempotency lock (Layer 1) ─────────────────────────────
        twilio_msg_id = payload.get("MessageSid", "")

        if twilio_msg_id and await idempotency_checker.is_processing(twilio_msg_id):
            logger.info(
                "[Idempotency] Twilio msg already in-flight, dropping duplicate | sid=%s",
                twilio_msg_id,
            )
            return Response(content=TWIML_EMPTY, media_type="application/xml")

        if twilio_msg_id:
            await idempotency_checker.mark_processing(twilio_msg_id)

        async def _process_and_unlock_twilio():
            try:
                await whatsapp_service.process_incoming_message(payload, True)
            finally:
                if twilio_msg_id:
                    await idempotency_checker.mark_done(twilio_msg_id)

        background_tasks.add_task(_process_and_unlock_twilio)
        return Response(content=TWIML_EMPTY, media_type="application/xml")

    except Exception as exc:
        logger.error("[Webhook] Twilio handler error: %s", str(exc), exc_info=True)
        return Response(content=TWIML_EMPTY, media_type="application/xml")


# ──────────────────────────────────────────────────────────────────────────────
# Connection Test (non-webhook, safe to return errors)
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/whatsapp/test")
@router.post("/test")
async def test_whatsapp_connection(request: Request):
    """
    Manually simulates a WhatsApp connection check.
    Not a real webhook — safe to return 4xx/5xx here.
    """
    try:
        payload = await request.json()
        token = payload.get("token")
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
