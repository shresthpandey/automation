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

    async def process_incoming_message(self, payload: dict) -> None:
        """
        Processes WhatsApp webhook message: catalogs organizations, contacts,
        saves conversations/messages, and triggers LLM RAG completions if active.
        """
        try:
            # 1. Parse payload fields
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
            timestamp = msg.get("timestamp")
            
            # Map type contents
            content = ""
            if msg_type == "text":
                content = msg.get("text", {}).get("body", "")
            elif msg_type in ("image", "audio", "document"):
                media_info = msg.get(msg_type, {})
                content = f"[Media: {msg_type.upper()}] ID={media_info.get('id')} mime={media_info.get('mime_type')}"
            else:
                content = f"[Unsupported System message type: {msg_type}]"

            # Parse phone number ID from webhook metadata
            phone_number_id = metadata.get("phone_number_id")
            if not phone_number_id:
                logger.error("Missing phone_number_id metadata in webhook request.")
                return

            # 2. Look up the organization mapped to this WhatsApp Phone Number ID
            org_res = supabase_client.table("organizations") \
                .select("id, whatsapp_token") \
                .eq("whatsapp_phone_number_id", phone_number_id) \
                .execute()
                
            if not org_res.data:
                logger.error(f"No organization profile mapped for whatsapp_phone_number_id: {phone_number_id}")
                return
                
            org = org_res.data[0]
            org_id = org["id"]
            org_whatsapp_token = org["whatsapp_token"]

            # 3. Locate or create CRM Customer profile
            contact_res = supabase_client.table("contacts") \
                .select("*") \
                .eq("org_id", org_id) \
                .eq("phone", sender_phone) \
                .execute()
                
            if not contact_res.data:
                logger.info(f"Creating new CRM contact record for {sender_phone} in org {org_id}")
                profile_name = value.get("contacts", [{}])[0].get("profile", {}).get("name", "WhatsApp User")
                ins_contact = supabase_client.table("contacts").insert({
                    "org_id": org_id,
                    "phone": sender_phone,
                    "name": profile_name,
                    "source": "whatsapp"
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
                    "channel": "whatsapp"
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
                
                # Dispatch outbound text message via Meta APIs
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
