import asyncio
import httpx
import time
import logging
from typing import Optional
from app.database import supabase_client
from app.utils.error_handler import (
    get_logger,
    log_error,
    WhatsAppAPIError,
    TwilioAPIError,
    SupabaseError,
)

logger = get_logger("whatsapp_service")


class WhatsAppService:

    # ──────────────────────────────────────────────
    # Meta WhatsApp Cloud API — Outbound Sender
    # ──────────────────────────────────────────────
    async def send_whatsapp_message(
        self,
        phone: str,
        message: str,
        phone_number_id: str,
        token: str,
    ) -> Optional[str]:
        """
        Dispatches outbound text to Meta Graph API.
        Handles 401, 429 (retry once after 5s), 5xx (save as failed).
        Returns message_id on success, None on failure.
        """
        url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "text",
            "text": {"body": message},
        }
        phone_tail = phone[-4:] if len(phone) >= 4 else phone

        for attempt in range(2):  # max 2 attempts
            try:
                logger.info("[WhatsApp] Sending to ...%s (attempt %d)", phone_tail, attempt + 1)
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(url, json=payload, headers=headers)

                status = response.status_code

                if status == 200:
                    data = response.json()
                    message_id = data.get("messages", [{}])[0].get("id")
                    logger.info("[WhatsApp] Sent OK → msg_id=%s phone=...%s", message_id, phone_tail)
                    return message_id

                elif status == 401:
                    log_error("WhatsAppAPIError", f"Invalid WhatsApp token for phone_number_id={phone_number_id}")
                    raise WhatsAppAPIError("Invalid WhatsApp token — check WHATSAPP_TOKEN env var.")

                elif status == 429:
                    log_error("RateLimitError", f"WhatsApp rate limit hit (attempt {attempt+1}) for ...{phone_tail}")
                    if attempt == 0:
                        logger.warning("[WhatsApp] Rate limited — waiting 5s before retry...")
                        await asyncio.sleep(5)
                        continue  # retry once
                    raise WhatsAppAPIError("WhatsApp rate limit exceeded after retry.")

                elif status >= 500:
                    log_error("WhatsAppAPIError", f"WhatsApp API server error [{status}]: {response.text[:200]}")
                    logger.error("[WhatsApp] API down [%d] → marking send as failed for ...%s", status, phone_tail)
                    return None  # caller handles DB save as failed

                else:
                    log_error("WhatsAppAPIError", f"Unexpected status [{status}]: {response.text[:200]}")
                    return None

            except WhatsAppAPIError:
                raise
            except Exception as exc:
                log_error("WhatsAppAPIError", f"Network exception sending to ...{phone_tail}", exc)
                return None

        return None

    # ──────────────────────────────────────────────
    # Twilio WhatsApp Sandbox — Outbound Sender
    # ──────────────────────────────────────────────
    async def send_twilio_message(self, phone: str, message: str) -> Optional[str]:
        """
        Dispatches outbound text via Twilio REST API.
        Handles 401, 429 (retry once after 5s), 5xx gracefully.
        Returns message SID on success, None on failure.
        """
        from app.config import settings

        account_sid = settings.twilio_account_sid
        auth_token = settings.twilio_auth_token
        from_number = settings.twilio_whatsapp_number or "+14155238886"

        if not account_sid or not auth_token:
            log_error("TwilioAPIError", "Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing)")
            return None

        clean_phone = phone.strip().lstrip("+")
        phone_tail = clean_phone[-4:] if len(clean_phone) >= 4 else clean_phone

        from_wa = from_number if from_number.startswith("whatsapp:") else f"whatsapp:{from_number}"
        to_wa = f"whatsapp:+{clean_phone}"

        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

        for attempt in range(2):
            try:
                logger.info("[Twilio] Sending to ...%s (attempt %d)", phone_tail, attempt + 1)
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(
                        url,
                        data={"From": from_wa, "To": to_wa, "Body": message},
                        auth=(account_sid, auth_token),
                    )

                status = response.status_code

                if status in (200, 201):
                    sid = response.json().get("sid")
                    logger.info("[Twilio] Sent OK → sid=%s phone=...%s", sid, phone_tail)
                    return sid

                elif status == 401:
                    log_error("TwilioAPIError", "Invalid Twilio credentials (401)")
                    raise TwilioAPIError("Invalid Twilio credentials — check TWILIO_AUTH_TOKEN.")

                elif status == 429:
                    log_error("RateLimitError", f"Twilio rate limit hit (attempt {attempt+1})")
                    if attempt == 0:
                        logger.warning("[Twilio] Rate limited — waiting 5s before retry...")
                        await asyncio.sleep(5)
                        continue
                    raise TwilioAPIError("Twilio rate limit exceeded after retry.")

                elif status >= 500:
                    log_error("TwilioAPIError", f"Twilio server error [{status}]: {response.text[:200]}")
                    return None

                else:
                    log_error("TwilioAPIError", f"Twilio unexpected [{status}]: {response.text[:200]}")
                    return None

            except TwilioAPIError:
                raise
            except Exception as exc:
                log_error("TwilioAPIError", f"Network exception sending to ...{phone_tail}", exc)
                return None

        return None

    # ──────────────────────────────────────────────
    # Unified Outbound Router
    # ──────────────────────────────────────────────
    async def send_text_message(
        self,
        phone: str,
        message: str,
        channel: str = "whatsapp",
        phone_number_id: Optional[str] = None,
        token: Optional[str] = None,
    ) -> Optional[str]:
        """Routes outbound messages to the correct provider (Twilio vs Meta)."""
        if channel == "twilio":
            return await self.send_twilio_message(phone, message)
        else:
            from app.config import settings
            p_id = phone_number_id or settings.whatsapp_phone_number_id
            tok = token or settings.whatsapp_token
            return await self.send_whatsapp_message(phone, message, p_id, tok)

    # ──────────────────────────────────────────────
    # Incoming Message Processor (Meta + Twilio)
    # ──────────────────────────────────────────────
    async def process_incoming_message(self, payload: dict, is_twilio: bool = False) -> None:
        """
        Processes incoming WhatsApp messages from Meta or Twilio.
        All Supabase calls wrapped in SupabaseError handlers.
        """
        try:
            if is_twilio:
                from_val = payload.get("From", "")
                to_val = payload.get("To", "")
                sender_phone = from_val.replace("whatsapp:", "").replace("+", "").strip()
                phone_number_id = to_val.replace("whatsapp:", "").replace("+", "").strip()
                message_id = payload.get("MessageSid", "")
                content = payload.get("Body", "")
                profile_name = "Twilio WhatsApp User"
                channel = "twilio"

                logger.info(
                    "[Webhook] Twilio inbound | phone=...%s | type=text | len=%d",
                    sender_phone[-4:] if len(sender_phone) >= 4 else sender_phone,
                    len(content),
                )
            else:
                entry = payload.get("entry", [])[0]
                changes = entry.get("changes", [])[0]
                value = changes.get("value", {})
                messages = value.get("messages", [])
                metadata = value.get("metadata", {})

                if not messages:
                    logger.info("[Webhook] Meta payload received with no messages block. Skipping.")
                    return

                msg = messages[0]
                sender_phone = msg.get("from", "")
                message_id = msg.get("id", "")
                msg_type = msg.get("type", "text")

                if msg_type == "text":
                    content = msg.get("text", {}).get("body", "")
                elif msg_type in ("image", "audio", "document"):
                    media_info = msg.get(msg_type, {})
                    content = f"[Media: {msg_type.upper()}] ID={media_info.get('id')} mime={media_info.get('mime_type')}"
                else:
                    content = f"[Unsupported: {msg_type}]"

                phone_number_id = metadata.get("phone_number_id", "")
                profile_name = value.get("contacts", [{}])[0].get("profile", {}).get("name", "WhatsApp User")
                channel = "whatsapp"

                logger.info(
                    "[Webhook] Meta inbound | phone=...%s | type=%s | len=%d",
                    sender_phone[-4:] if len(sender_phone) >= 4 else sender_phone,
                    msg_type,
                    len(content),
                )

            if not phone_number_id:
                logger.error("[Webhook] Missing phone_number_id — cannot route to org.")
                return

            # ── Org lookup ──────────────────────────
            try:
                org_res = supabase_client.table("organizations") \
                    .select("id, whatsapp_token") \
                    .eq("whatsapp_phone_number_id", phone_number_id) \
                    .execute()
            except Exception as exc:
                raise SupabaseError(f"Org lookup failed for phone_number_id={phone_number_id}", str(exc))

            if not org_res.data:
                try:
                    fallback = supabase_client.table("organizations").select("id, whatsapp_token").limit(1).execute()
                    org = fallback.data[0] if fallback.data else None
                except Exception as exc:
                    raise SupabaseError("Fallback org lookup failed", str(exc))
                if not org:
                    logger.error("[Webhook] No org found for phone_number_id=%s", phone_number_id)
                    return
            else:
                org = org_res.data[0]

            org_id = org["id"]
            org_whatsapp_token = org["whatsapp_token"]

            # ── Contact upsert ──────────────────────
            try:
                contact_res = supabase_client.table("contacts") \
                    .select("*") \
                    .eq("org_id", org_id) \
                    .eq("phone", sender_phone) \
                    .execute()
            except Exception as exc:
                raise SupabaseError(f"Contact lookup failed for phone=...{sender_phone[-4:]}", str(exc))

            if not contact_res.data:
                try:
                    ins = supabase_client.table("contacts").insert({
                        "org_id": org_id,
                        "phone": sender_phone,
                        "name": profile_name,
                        "source": channel,
                    }).execute()
                    contact = ins.data[0]
                    logger.info("[CRM] New contact created: ...%s", sender_phone[-4:])
                except Exception as exc:
                    raise SupabaseError("Contact insert failed", str(exc))
            else:
                contact = contact_res.data[0]

            # ── Conversation upsert ─────────────────
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
                    logger.info("[Conv] New conversation opened for contact %s", contact["id"])
                except Exception as exc:
                    raise SupabaseError("Conversation insert failed", str(exc))
            else:
                conversation = conv_res.data[0]

            # ── Save inbound message ────────────────
            try:
                supabase_client.table("messages").insert({
                    "conversation_id": conversation["id"],
                    "org_id": org_id,
                    "sender_type": "contact",
                    "content": content,
                    "channel_message_id": message_id,
                }).execute()
            except Exception as exc:
                raise SupabaseError("Message insert failed", str(exc))

            # ── AI reply ───────────────────────────
            if conversation.get("ai_enabled", True):
                from app.services.ai_engine import ai_engine_service
                t0 = time.monotonic()

                ai_res = ai_engine_service.generate_reply(
                    message=content,
                    conversation_id=conversation["id"],
                    org_id=org_id,
                    contact=contact,
                )
                latency_ms = int((time.monotonic() - t0) * 1000)

                ai_reply = ai_res.get("reply", "")
                confidence = ai_res.get("confidence", 0.0)
                tokens_used = ai_res.get("tokens_used", 0)

                logger.info(
                    "[AI] Reply generated | org=%s | confidence=%.2f | tokens=%d | latency=%dms",
                    org_id, confidence, tokens_used, latency_ms,
                )

                if channel == "twilio":
                    outbound_id = await self.send_twilio_message(sender_phone, ai_reply)
                else:
                    outbound_id = await self.send_whatsapp_message(
                        sender_phone, ai_reply, phone_number_id, org_whatsapp_token
                    )

                try:
                    supabase_client.table("messages").insert({
                        "conversation_id": conversation["id"],
                        "org_id": org_id,
                        "sender_type": "ai",
                        "content": ai_reply,
                        "channel_message_id": outbound_id,
                        "ai_confidence": confidence,
                    }).execute()
                except Exception as exc:
                    raise SupabaseError("AI message save failed", str(exc))

        except SupabaseError as exc:
            log_error("SupabaseError", exc.message, exc)
        except Exception as exc:
            log_error("UnhandledException", f"process_incoming_message crashed: {str(exc)}", exc)


# Singleton
whatsapp_service = WhatsAppService()
