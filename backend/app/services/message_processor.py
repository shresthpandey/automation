"""
ConverseOS — Message Processor Service

Separates the fast DB path (< 500ms) from the slow AI path (3-8s):

  save_incoming_message()  — called in webhook handler BEFORE returning 200
    - Idempotency check (Layer 2 DB)
    - Org lookup / contact upsert / conversation upsert
    - Save raw inbound message  (status='received')
    - Returns dict with all context needed for AI step
    - No OpenAI calls, no HTTP calls to external APIs
    - Target: < 500ms

  process_ai_reply()       — queued as FastAPI BackgroundTask, runs AFTER 200 returned
    - Checks ai_enabled, rate limit, idempotency
    - Updates message status → 'processing'
    - Calls ai_engine.generate_reply()
    - Sends reply via WhatsApp / Twilio
    - Saves AI reply message  (status='replied')
    - On escalation → creates escalation record
    - Updates message status → 'replied' | 'escalated' | 'failed'
    - Wrapped in asyncio.wait_for(timeout=25s)
"""

import asyncio
import time
from typing import Optional

from app.database import supabase_client
from app.utils.error_handler import get_logger, log_error, SupabaseError
from app.utils.rate_limiter import rate_limiter

logger = get_logger("message_processor")


# ─────────────────────────────────────────────────────────────────────────────
# Status constants
# ─────────────────────────────────────────────────────────────────────────────
STATUS_RECEIVED   = "received"
STATUS_PROCESSING = "processing"
STATUS_REPLIED    = "replied"
STATUS_ESCALATED  = "escalated"
STATUS_FAILED     = "failed"


def _set_message_status(message_id: str, status: str) -> None:
    """Fire-and-forget status update — swallows errors so it never crashes callers."""
    try:
        supabase_client.table("messages").update(
            {"status": status}
        ).eq("id", message_id).execute()
    except Exception as exc:
        logger.warning("[MsgProcessor] Could not update status for msg %s → %s: %s", message_id, status, str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# FAST PATH — called synchronously inside webhook handler (before returning 200)
# ─────────────────────────────────────────────────────────────────────────────
async def save_incoming_message(message_data: dict) -> Optional[dict]:
    """
    Persists the inbound message and all related records (contact, conversation).
    Must complete in < 500ms — zero AI or HTTP calls.

    Args:
        message_data: dict with keys:
            channel_message_id, sender_phone, content, channel,
            phone_number_id, profile_name, is_twilio

    Returns:
        dict with: message_id, conversation_id, contact, org, channel
        None if any critical step failed.
    """
    t0 = time.monotonic()

    channel_message_id: str = message_data.get("channel_message_id", "")
    sender_phone:       str = message_data.get("sender_phone", "")
    content:            str = message_data.get("content", "")
    channel:            str = message_data.get("channel", "whatsapp")
    phone_number_id:    str = message_data.get("phone_number_id", "")
    profile_name:       str = message_data.get("profile_name", "WhatsApp User")
    phone_tail = sender_phone[-4:] if len(sender_phone) >= 4 else sender_phone

    try:
        # ── DB Layer-2 idempotency check ──────────────────────────────────────
        if channel_message_id:
            try:
                dup = supabase_client.table("messages") \
                    .select("id") \
                    .eq("channel_message_id", channel_message_id) \
                    .limit(1) \
                    .execute()
                if dup.data:
                    logger.info(
                        "[MsgProcessor] Duplicate msg skipped (already in DB) | msg_id=%s",
                        channel_message_id,
                    )
                    return None
            except Exception as exc:
                # Fail open — DB unique index is the final safety net
                logger.warning("[MsgProcessor] Dedup DB check failed (proceeding): %s", str(exc))

        # ── Org lookup ────────────────────────────────────────────────────────
        try:
            org_res = supabase_client.table("organizations") \
                .select("id, name, whatsapp_token") \
                .eq("whatsapp_phone_number_id", phone_number_id) \
                .execute()
        except Exception as exc:
            raise SupabaseError(f"Org lookup failed for phone_number_id={phone_number_id}", str(exc))

        if not org_res.data:
            # Fallback: first org (useful for Twilio sandbox which has no phone_number_id)
            try:
                fallback = supabase_client.table("organizations") \
                    .select("id, name, whatsapp_token") \
                    .limit(1).execute()
                org = fallback.data[0] if fallback.data else None
            except Exception as exc:
                raise SupabaseError("Fallback org lookup failed", str(exc))
            if not org:
                logger.error("[MsgProcessor] No org found for phone_number_id=%s", phone_number_id)
                return None
        else:
            org = org_res.data[0]

        org_id = org["id"]

        # ── Contact upsert ────────────────────────────────────────────────────
        try:
            contact_res = supabase_client.table("contacts") \
                .select("*") \
                .eq("org_id", org_id) \
                .eq("phone", sender_phone) \
                .execute()
        except Exception as exc:
            raise SupabaseError(f"Contact lookup failed for ...{phone_tail}", str(exc))

        if not contact_res.data:
            try:
                ins = supabase_client.table("contacts").insert({
                    "org_id": org_id,
                    "phone": sender_phone,
                    "name": profile_name,
                    "source": channel,
                }).execute()
                contact = ins.data[0]
                logger.info("[MsgProcessor] New contact created: ...%s", phone_tail)
            except Exception as exc:
                raise SupabaseError("Contact insert failed", str(exc))
        else:
            contact = contact_res.data[0]

        # ── Conversation upsert ───────────────────────────────────────────────
        try:
            conv_res = supabase_client.table("conversations") \
                .select("*") \
                .eq("org_id", org_id) \
                .eq("contact_id", contact["id"]) \
                .eq("status", "open") \
                .execute()
        except Exception as exc:
            raise SupabaseError("Conversation lookup failed", str(exc))

        if not conv_res.data:
            try:
                ins_conv = supabase_client.table("conversations").insert({
                    "org_id": org_id,
                    "contact_id": contact["id"],
                    "status": "open",
                    "channel": channel,
                }).execute()
                conversation = ins_conv.data[0]
                logger.info("[MsgProcessor] New conversation opened for contact %s", contact["id"])
            except Exception as exc:
                raise SupabaseError("Conversation insert failed", str(exc))
        else:
            conversation = conv_res.data[0]

        # ── Save inbound message (status='received') ──────────────────────────
        try:
            msg_ins = supabase_client.table("messages").insert({
                "conversation_id": conversation["id"],
                "org_id": org_id,
                "sender_type": "contact",
                "content": content,
                "channel_message_id": channel_message_id,
                "status": STATUS_RECEIVED,
            }).execute()
            saved_message = msg_ins.data[0] if msg_ins.data else {}
            saved_msg_id = saved_message.get("id", "")
        except Exception as exc:
            raise SupabaseError("Message insert failed", str(exc))

        elapsed_ms = int((time.monotonic() - t0) * 1000)
        logger.info(
            "[MsgProcessor] save_incoming_message done | org=%s | conv=%s | elapsed=%dms",
            org_id, conversation["id"], elapsed_ms,
        )

        return {
            "message_id":       saved_msg_id,
            "conversation_id":  conversation["id"],
            "conversation":     conversation,
            "contact":          contact,
            "org":              org,
            "org_id":           org_id,
            "channel":          channel,
            "sender_phone":     sender_phone,
            "content":          content,
            "phone_number_id":  phone_number_id,
        }

    except SupabaseError as exc:
        log_error("SupabaseError", f"save_incoming_message failed: {exc.message}", exc)
        return None
    except Exception as exc:
        log_error("UnhandledException", f"save_incoming_message crashed: {str(exc)}", exc)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# SLOW PATH — runs as BackgroundTask, AFTER 200 has been returned to Meta/Twilio
# ─────────────────────────────────────────────────────────────────────────────
async def _process_ai_reply_inner(
    message_data: dict,
    save_result: dict,
) -> None:
    """
    Core AI reply logic. Called inside process_ai_reply() which wraps it
    in asyncio.wait_for(timeout=25s).
    """
    from app.services.ai_engine import ai_engine_service
    from app.services.whatsapp import whatsapp_service

    org_id          = save_result["org_id"]
    org             = save_result["org"]
    conversation    = save_result["conversation"]
    conversation_id = save_result["conversation_id"]
    contact         = save_result["contact"]
    channel         = save_result["channel"]
    sender_phone    = save_result["sender_phone"]
    phone_number_id = save_result["phone_number_id"]
    content         = save_result["content"]
    inbound_msg_id  = save_result["message_id"]
    phone_tail      = sender_phone[-4:] if len(sender_phone) >= 4 else sender_phone

    # ── Guard: ai_enabled ─────────────────────────────────────────────────────
    if not conversation.get("ai_enabled", True):
        logger.info(
            "[MsgProcessor] AI disabled for conversation %s — skipping reply.",
            conversation_id,
        )
        return

    # ── Guard: rate limit (AI cooldown per contact) ───────────────────────────
    if not rate_limiter.is_allowed(f"contact:{sender_phone}:ai_bg", max_calls=1, window_seconds=3):
        logger.info(
            "[MsgProcessor] AI background rate limit hit for ...%s — skipping.",
            phone_tail,
        )
        return

    # ── Update inbound message status → processing ────────────────────────────
    if inbound_msg_id:
        _set_message_status(inbound_msg_id, STATUS_PROCESSING)

    # ── Generate AI reply ─────────────────────────────────────────────────────
    t0 = time.monotonic()
    ai_res = ai_engine_service.generate_reply(
        message=content,
        conversation_id=conversation_id,
        org_id=org_id,
        contact=contact,
    )
    latency_ms = int((time.monotonic() - t0) * 1000)

    ai_reply        = ai_res.get("reply", "")
    confidence      = ai_res.get("confidence", 0.0)
    tokens_used     = ai_res.get("tokens_used", 0)
    should_escalate = ai_res.get("should_escalate", False)
    ai_errored      = ai_res.get("error", False)

    logger.info(
        "[MsgProcessor] AI reply | org=%s | confidence=%.2f | tokens=%d | latency=%dms | escalate=%s",
        org_id, confidence, tokens_used, latency_ms, should_escalate,
    )

    # ── Send reply via correct channel ────────────────────────────────────────
    outbound_ids: list[str] = []
    if channel == "twilio":
        outbound_ids = await whatsapp_service.send_twilio_message(sender_phone, ai_reply)
    else:
        outbound_ids = await whatsapp_service.send_whatsapp_message(
            phone=sender_phone,
            message=ai_reply,
            phone_number_id=phone_number_id,
            token=org.get("whatsapp_token", ""),
        )
    logger.info(
        "[MsgProcessor] Outbound sent | channel=%s | phone=...%s | outbound_ids=%s",
        channel, phone_tail, outbound_ids,
    )

    # ── Determine final status ────────────────────────────────────────────────
    final_status = STATUS_ESCALATED if should_escalate else STATUS_REPLIED

    # ── Save AI reply message ─────────────────────────────────────────────────
    try:
        channel_msg_id = outbound_ids[0] if outbound_ids else None
        ai_msg_ins = supabase_client.table("messages").insert({
            "conversation_id": conversation_id,
            "org_id": org_id,
            "sender_type": "ai",
            "content": ai_reply,
            "channel_message_id": channel_msg_id,
            "ai_confidence": confidence,
            "status": final_status,
        }).execute()
        ai_msg_id = ai_msg_ins.data[0].get("id") if ai_msg_ins.data else None
    except Exception as exc:
        log_error("SupabaseError", "AI message save failed", exc)
        ai_msg_id = None

    # ── Update inbound message status ─────────────────────────────────────────
    if inbound_msg_id:
        _set_message_status(inbound_msg_id, final_status)

    # ── Escalation record ─────────────────────────────────────────────────────
    if should_escalate:
        try:
            supabase_client.table("escalations").insert({
                "org_id": org_id,
                "conversation_id": conversation_id,
                "contact_id": contact["id"],
                "trigger_message_id": inbound_msg_id,
                "ai_confidence": confidence,
                "reason": "low_confidence" if not ai_errored else "ai_error",
            }).execute()
            logger.info(
                "[MsgProcessor] Escalation created | conv=%s | confidence=%.2f",
                conversation_id, confidence,
            )
        except Exception as exc:
            # Escalation table might not exist — log but don't crash
            logger.warning("[MsgProcessor] Escalation insert failed (non-critical): %s", str(exc))

    # ── Update conversation last_message_at ───────────────────────────────────
    try:
        supabase_client.table("conversations").update({
            "last_message_at": "now()",
        }).eq("id", conversation_id).execute()
    except Exception as exc:
        logger.warning("[MsgProcessor] Conversation timestamp update failed: %s", str(exc))


async def process_ai_reply(
    message_data: dict,
    save_result: dict,
    message_id_for_lock: str = "",
) -> None:
    """
    Public entry point for BackgroundTasks.
    Wraps _process_ai_reply_inner in a 25-second timeout.
    Always releases the idempotency lock in the finally block.

    Args:
        message_data:        Original parsed webhook payload dict.
        save_result:         Return value of save_incoming_message().
        message_id_for_lock: The channel_message_id used as the idempotency key.
    """
    from app.utils.idempotency import idempotency_checker

    inbound_msg_id = save_result.get("message_id", "")

    try:
        await asyncio.wait_for(
            _process_ai_reply_inner(message_data, save_result),
            timeout=25.0,
        )
    except asyncio.TimeoutError:
        log_error(
            "TimeoutError",
            f"process_ai_reply timed out after 25s | conv={save_result.get('conversation_id')}",
        )
        if inbound_msg_id:
            _set_message_status(inbound_msg_id, STATUS_FAILED)
    except Exception as exc:
        log_error("UnhandledException", f"process_ai_reply crashed: {str(exc)}", exc)
        if inbound_msg_id:
            _set_message_status(inbound_msg_id, STATUS_FAILED)
    finally:
        # Always release idempotency lock — even if AI crashed or timed out
        if message_id_for_lock:
            await idempotency_checker.mark_done(message_id_for_lock)
        logger.info(
            "[MsgProcessor] Background task complete | conv=%s",
            save_result.get("conversation_id", "?"),
        )
