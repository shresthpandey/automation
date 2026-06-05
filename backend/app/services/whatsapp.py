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


def sanitize_and_split_message(text: str) -> list[str]:
    """
    Splits message text into parts <= 4000 chars, adding suffixes.
    Max 3 parts total, truncating the last if needed.
    """
    if not text:
        return []

    MAX_MSG_LEN = 4000
    if len(text) <= MAX_MSG_LEN:
        return [text]

    # Suffixes look like " (1/2)", " (2/2)" etc., which are 6 chars long.
    # So each part before suffix must be <= 3994 characters.
    max_part_len = 3994
    parts = []
    remaining = text

    while remaining and len(parts) < 3:
        if len(remaining) <= max_part_len:
            parts.append(remaining)
            remaining = ""
            break

        # Look at the chunk of max_part_len length
        chunk = remaining[:max_part_len]

        # Find a split point near the end of the chunk (let's say the last 800 chars)
        # Priority 1: Paragraph break (\n\n)
        idx = chunk.rfind("\n\n", max_part_len - 800)
        if idx != -1:
            split_idx = idx + 2
        else:
            # Priority 2: Sentence end (". ")
            idx = chunk.rfind(". ", max_part_len - 800)
            if idx != -1:
                split_idx = idx + 2
            else:
                # Priority 3: Word boundary (" ")
                idx = chunk.rfind(" ", max_part_len - 800)
                if idx != -1:
                    split_idx = idx + 1
                else:
                    # Fallback: check the entire chunk from right to left
                    # Paragraph break
                    idx = chunk.rfind("\n\n")
                    if idx != -1:
                        split_idx = idx + 2
                    else:
                        # Sentence end
                        idx = chunk.rfind(". ")
                        if idx != -1:
                            split_idx = idx + 2
                        else:
                            # Word boundary
                            idx = chunk.rfind(" ")
                            if idx != -1:
                                split_idx = idx + 1
                            else:
                                # Hard cut
                                split_idx = max_part_len

        parts.append(remaining[:split_idx])
        remaining = remaining[split_idx:]

    # If there is still remaining text, truncate the last part and add "..."
    if remaining and len(parts) == 3:
        # We need to fit "..." and " (3/3)" into 4000 chars.
        # So parts[2] text before suffix + "..." <= 3994 -> text <= 3991.
        parts[2] = parts[2][:3991] + "..."

    # Add suffixes
    total = len(parts)
    suffix_parts = []
    for i, part in enumerate(parts):
        suffix_parts.append(f"{part} ({i+1}/{total})")
    return suffix_parts


class WhatsAppService:

    # ──────────────────────────────────────────────
    # Meta WhatsApp Cloud API — Outbound Sender
    # ──────────────────────────────────────────────
    async def _send_single_whatsapp_part(
        self,
        phone: str,
        message: str,
        phone_number_id: str,
        token: str,
    ) -> Optional[str]:
        """
        Dispatches a single outbound text part to Meta Graph API.
        Handles 401, 429 (retry once after 5s), 5xx.
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
                logger.info("[WhatsApp] Sending part to ...%s (attempt %d)", phone_tail, attempt + 1)
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(url, json=payload, headers=headers)

                status = response.status_code

                if status == 200:
                    data = response.json()
                    message_id = data.get("messages", [{}])[0].get("id")
                    logger.info("[WhatsApp] Part sent OK → msg_id=%s phone=...%s", message_id, phone_tail)
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

    async def send_whatsapp_message(
        self,
        phone: str,
        message: str,
        phone_number_id: str,
        token: str,
    ) -> list[str]:
        """
        Dispatches outbound text to Meta Graph API.
        Enforces smart message splitting if message is over 4000 characters.
        """
        parts = sanitize_and_split_message(message)
        message_ids = []
        for i, part in enumerate(parts):
            if i > 0:
                await asyncio.sleep(0.5)
            msg_id = await self._send_single_whatsapp_part(phone, part, phone_number_id, token)
            if msg_id:
                message_ids.append(msg_id)
        return message_ids

    # ──────────────────────────────────────────────
    # Twilio WhatsApp Sandbox — Outbound Sender
    # ──────────────────────────────────────────────
    async def _send_single_twilio_part(self, phone: str, message: str) -> Optional[str]:
        """
        Dispatches a single outbound text via Twilio REST API.
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
                logger.info("[Twilio] Sending part to ...%s (attempt %d)", phone_tail, attempt + 1)
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(
                        url,
                        data={"From": from_wa, "To": to_wa, "Body": message},
                        auth=(account_sid, auth_token),
                    )

                status = response.status_code

                if status in (200, 201):
                    sid = response.json().get("sid")
                    logger.info("[Twilio] Part sent OK → sid=%s phone=...%s", sid, phone_tail)
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

    async def send_twilio_message(self, phone: str, message: str) -> list[str]:
        """
        Dispatches outbound text via Twilio REST API.
        Enforces smart message splitting if message is over 4000 characters.
        """
        parts = sanitize_and_split_message(message)
        message_ids = []
        for i, part in enumerate(parts):
            if i > 0:
                await asyncio.sleep(0.5)
            msg_id = await self._send_single_twilio_part(phone, part)
            if msg_id:
                message_ids.append(msg_id)
        return message_ids

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
    ) -> list[str]:
        """Routes outbound messages to the correct provider (Twilio vs Meta)."""
        if channel == "twilio":
            return await self.send_twilio_message(phone, message)
        else:
            from app.config import settings
            p_id = phone_number_id or settings.whatsapp_phone_number_id
            tok = token or settings.whatsapp_token
            return await self.send_whatsapp_message(phone, message, p_id, tok)

    # ──────────────────────────────────────────────────────────────────────────
    # NOTE: process_incoming_message() has been superseded by message_processor.
    # The fast-path (save_incoming_message) and slow-path (process_ai_reply)
    # are now in backend/app/services/message_processor.py.
    # This stub exists only for backwards compatibility with any stray callers.
    # ──────────────────────────────────────────────────────────────────────────
    async def process_incoming_message(self, payload: dict, is_twilio: bool = False) -> None:
        """
        Deprecated — use message_processor.save_incoming_message() +
        message_processor.process_ai_reply() instead.

        This stub delegates to the new functions for backwards compatibility.
        """
        from app.services.message_processor import save_incoming_message, process_ai_reply
        from app.routers.webhooks import _parse_meta_payload, _parse_twilio_payload

        if is_twilio:
            message_data = _parse_twilio_payload(payload)
        else:
            message_data = _parse_meta_payload(payload)

        if not message_data:
            return

        save_result = await save_incoming_message(message_data)
        if save_result:
            await process_ai_reply(
                message_data=message_data,
                save_result=save_result,
                message_id_for_lock="",
            )


# Singleton
whatsapp_service = WhatsAppService()

