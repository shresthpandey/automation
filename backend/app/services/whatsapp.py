import httpx
import logging
from typing import Optional
from app.database import supabase_client
from app.services.ai_engine import ai_engine_service

# Setup logger configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("whatsapp_service")

class WhatsAppService:
    async def send_whatsapp_message(
        self, 
        phone: str, 
        message: str, 
        phone_number_id: str, 
        token: str
    ) -> Optional[str]:
        """
        Dispatches outbound text payload to Meta Graph APIs, returning message_id if successful.
        """
        url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "text",
            "text": {"body": message}
        }
        
        try:
            logger.info(f"Sending outbound WhatsApp message to {phone} via ID {phone_number_id}")
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=headers, timeout=12.0)
                
                if response.status_code == 200:
                    data = response.json()
                    message_id = data.get("messages", [{}])[0].get("id")
                    logger.info(f"Outbound WhatsApp message sent. Message ID: {message_id}")
                    return message_id
                else:
                    logger.error(f"Meta Graph API error [{response.status_code}]: {response.text}")
                    return None
        except Exception as e:
            logger.error(f"Network exception during WhatsApp send dispatch: {str(e)}", exc_info=True)
            return None

    async def send_twilio_message(self, phone: str, message: str) -> Optional[str]:
        """
        Dispatches outbound text payload to Twilio WhatsApp APIs, returning message_sid if successful.
        """
        from app.config import settings
        
        account_sid = settings.twilio_account_sid
        auth_token = settings.twilio_auth_token
        from_number = settings.twilio_whatsapp_number or "+14155238886"
        
        if not account_sid or not auth_token:
            logger.error("Twilio credentials are not configured in settings.")
            return None

        # Format phone for Twilio (expects e.g. whatsapp:+919876543210)
        clean_to_phone = phone.strip()
        if not clean_to_phone.startswith("+"):
            clean_to_phone = f"+{clean_to_phone}"
            
        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
        
        from_phone_twilio = from_number
        if not from_phone_twilio.startswith("whatsapp:"):
            from_phone_twilio = f"whatsapp:{from_phone_twilio}"
            
        payload = {
            "From": from_phone_twilio,
            "To": f"whatsapp:{clean_to_phone}",
            "Body": message
        }
        
        try:
            logger.info(f"Sending outbound Twilio WhatsApp message to {clean_to_phone}")
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url, 
                    data=payload,
                    auth=(account_sid, auth_token),
                    timeout=12.0
                )
                
                if response.status_code in (200, 201):
                    data = response.json()
                    message_sid = data.get("sid")
                    logger.info(f"Outbound Twilio WhatsApp message sent. Message SID: {message_sid}")
                    return message_sid
                else:
                    logger.error(f"Twilio API error [{response.status_code}]: {response.text}")
                    return None
        except Exception as e:
            logger.error(f"Network exception during Twilio send dispatch: {str(e)}", exc_info=True)
            return None

    async def send_text_message(
        self, 
        phone: str, 
        message: str, 
        channel: str = "whatsapp", 
        phone_number_id: Optional[str] = None, 
        token: Optional[str] = None
    ) -> Optional[str]:
        """
        Unified outbound routing method used by the manual reply agent tasks.
        """
        if channel == "twilio":
            return await self.send_twilio_message(phone, message)
        else:
            from app.config import settings
            p_id = phone_number_id or settings.whatsapp_phone_number_id
            tok = token or settings.whatsapp_token
            return await self.send_whatsapp_message(phone, message, p_id, tok)

    async def process_incoming_message(self, payload: dict, is_twilio: bool = False) -> None:
        """
        Processes incoming WhatsApp messages from either Meta Webhook or Twilio Webhook.
        """
        try:
            if is_twilio:
                # Parse Twilio fields
                from_val = payload.get("From", "")
                to_val = payload.get("To", "")
                
                sender_phone = from_val.replace("whatsapp:", "").replace("+", "").strip()
                phone_number_id = to_val.replace("whatsapp:", "").replace("+", "").strip()
                message_id = payload.get("MessageSid", "")
                content = payload.get("Body", "")
                profile_name = "Twilio WhatsApp User"
                channel = "twilio"
            else:
                # Parse Meta fields
                entry = payload.get("entry", [])[0]
                changes = entry.get("changes", [])[0]
                value = changes.get("value", {})
                messages = value.get("messages", [])
                metadata = value.get("metadata", {})
                
                if not messages:
                    logger.info("No incoming messages block in payload. Skipping.")
                    return

                msg = messages[0]
                sender_phone = msg.get("from")
                message_id = msg.get("id")
                msg_type = msg.get("type", "text")
                
                content = ""
                if msg_type == "text":
                    content = msg.get("text", {}).get("body", "")
                elif msg_type in ("image", "audio", "document"):
                    media_info = msg.get(msg_type, {})
                    content = f"[Media: {msg_type.upper()}] ID={media_info.get('id')} mime={media_info.get('mime_type')}"
                else:
                    content = f"[Unsupported System message type: {msg_type}]"

                phone_number_id = metadata.get("phone_number_id")
                if not phone_number_id:
                    logger.error("Missing phone_number_id metadata in webhook request.")
                    return
                
                profile_name = value.get("contacts", [{}])[0].get("profile", {}).get("name", "WhatsApp User")
                channel = "whatsapp"

            # 2. Look up organization
            org_res = supabase_client.table("organizations") \
                .select("id, whatsapp_token") \
                .eq("whatsapp_phone_number_id", phone_number_id) \
                .execute()
                
            if not org_res.data:
                # Fallback to first organization for testing/sandbox purposes
                fallback_org_res = supabase_client.table("organizations").select("id, whatsapp_token").limit(1).execute()
                if fallback_org_res.data:
                    org = fallback_org_res.data[0]
                else:
                    logger.error(f"No organization profile mapped for whatsapp_phone_number_id: {phone_number_id} and no fallback found.")
                    return
            else:
                org = org_res.data[0]
                
            org_id = org["id"]
            org_whatsapp_token = org["whatsapp_token"]

            # 3. Locate or create Customer contact profile
            contact_res = supabase_client.table("contacts") \
                .select("*") \
                .eq("org_id", org_id) \
                .eq("phone", sender_phone) \
                .execute()
                
            if not contact_res.data:
                logger.info(f"Creating new CRM contact record for {sender_phone} in org {org_id}")
                ins_contact = supabase_client.table("contacts").insert({
                    "org_id": org_id,
                    "phone": sender_phone,
                    "name": profile_name,
                    "source": channel
                }).execute()
                contact = ins_contact.data[0]
            else:
                contact = contact_res.data[0]

            # 4. Locate or create active Conversation record
            conv_res = supabase_client.table("conversations") \
                .select("*") \
                .eq("org_id", org_id) \
                .eq("contact_id", contact["id"]) \
                .eq("status", "open") \
                .execute()
                
            if not conv_res.data:
                logger.info(f"Opening new conversation thread for contact {contact['id']}")
                ins_conv = supabase_client.table("conversations").insert({
                    "org_id": org_id,
                    "contact_id": contact["id"],
                    "status": "open",
                    "channel": channel
                }).execute()
                conversation = ins_conv.data[0]
            else:
                conversation = conv_res.data[0]

            # 5. Store customer message record
            supabase_client.table("messages").insert({
                "conversation_id": conversation["id"],
                "org_id": org_id,
                "sender_type": "contact",
                "content": content,
                "channel_message_id": message_id
            }).execute()

            # 6. AI Agent copilot execution triggers
            if conversation.get("ai_enabled", True):
                # Fetch response from RAG and LLM models
                ai_res = ai_engine_service.generate_reply(
                    message=content,
                    conversation_id=conversation["id"],
                    org_id=org_id,
                    contact=contact
                )
                ai_reply = ai_res.get("reply", "")
                confidence_score = ai_res.get("confidence", 0.0)
                
                # Dispatch outbound text message
                if channel == "twilio":
                    outbound_msg_id = await self.send_twilio_message(
                        phone=sender_phone,
                        message=ai_reply
                    )
                else:
                    outbound_msg_id = await self.send_whatsapp_message(
                        phone=sender_phone, 
                        message=ai_reply, 
                        phone_number_id=phone_number_id, 
                        token=org_whatsapp_token
                    )
                
                # Save autonomous AI reply to databases
                supabase_client.table("messages").insert({
                    "conversation_id": conversation["id"],
                    "org_id": org_id,
                    "sender_type": "ai",
                    "content": ai_reply,
                    "channel_message_id": outbound_msg_id,
                    "ai_confidence": confidence_score
                }).execute()

        except Exception as e:
            logger.error(f"Fatal error executing process_incoming_message logic: {str(e)}", exc_info=True)

# Singleton global instance
whatsapp_service = WhatsAppService()
