from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.database import supabase_client
from app.models.schemas import MessageCreate, ConversationResponse, MessageResponse, ConversationStatusUpdate, ConversationUpdate
from app.services.whatsapp import whatsapp_service
from typing import List

router = APIRouter()

@router.get("/", response_model=List[ConversationResponse])
async def list_conversations():
    """
    Fetches active conversation threads, joining corresponding contact names.
    """
    # Fetch conversations sorted by last message timestamp
    conv_res = supabase_client.table("conversations").select("*, contacts(*)").order("last_message_at", desc=True).execute()
    
    # Restructure response mapping
    conversations = []
    for item in (conv_res.data or []):
        contact_info = item.pop("contacts", None)
        item["contact"] = contact_info
        conversations.append(item)
        
    return conversations

@router.get("/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_messages(conversation_id: str):
    """
    Loads all message bubbles associated with a given conversation ID.
    """
    msg_res = supabase_client.table("messages").select("*").eq("conversation_id", conversation_id).order("created_at").execute()
    return msg_res.data or []

async def dispatch_and_save_agent_msg(conversation_id: str, content: str, sender_type: str, channel: str):
    """
    Background worker task to dispatch outbound messages.
    """
    try:
        # Resolve target phone number
        conv_res = supabase_client.table("conversations").select("*, contacts(*)").eq("id", conversation_id).execute()
        if not conv_res.data:
            return
            
        conv = conv_res.data[0]
        contact = conv.get("contacts")
        
        # Save Agent Message record in DB
        supabase_client.table("messages").insert({
            "conversation_id": conversation_id,
            "sender_type": sender_type,
            "content": content,
            "channel": channel
        }).execute()
        
        # Update last message preview metadata
        supabase_client.table("conversations").update({
            "last_message": content,
            "last_message_at": "now()",
            "unread_count": 0
        }).eq("id", conversation_id).execute()

        # Send via WhatsApp / Twilio
        if channel in ("whatsapp", "twilio") and contact:
            phone_num = contact.get("phone") or contact.get("phone_number")
            if phone_num:
                await whatsapp_service.send_text_message(
                    phone=phone_num,
                    message=content,
                    channel=channel
                )
                
    except Exception as e:
        print(f"Failed to post manual response: {str(e)}")

@router.post("/{conversation_id}/messages")
async def send_message(conversation_id: str, payload: MessageCreate, background_tasks: BackgroundTasks):
    """
    Accepts manual response input, queues dispatch, and updates schemas.
    """
    background_tasks.add_task(
        dispatch_and_save_agent_msg, 
        conversation_id, 
        payload.content, 
        payload.sender_type, 
        payload.channel
    )
    return {"status": "message_queued"}

@router.patch("/{conversation_id}/status")
async def update_status(conversation_id: str, payload: ConversationStatusUpdate):
    """
    Modifies thread status (open, snoozed, closed).
    """
    res = supabase_client.table("conversations").update({"status": payload.status}).eq("id", conversation_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Conversation thread not found.")
    return {"status": "updated", "data": res.data[0]}

@router.patch("/{conversation_id}")
async def update_conversation(conversation_id: str, payload: ConversationUpdate):
    """
    Modifies conversation properties (status, assigned_to, ai_enabled).
    """
    update_data = {}
    if payload.status is not None:
        update_data["status"] = payload.status
    if payload.assigned_to is not None:
        update_data["assigned_to"] = payload.assigned_to if payload.assigned_to else None
    if payload.ai_enabled is not None:
        update_data["ai_enabled"] = payload.ai_enabled

    if not update_data:
        raise HTTPException(status_code=400, detail="No properties provided for update.")

    res = supabase_client.table("conversations").update(update_data).eq("id", conversation_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Conversation thread not found.")
    return {"status": "updated", "data": res.data[0]}

@router.post("/{conversation_id}/suggest")
async def get_ai_suggestion(conversation_id: str):
    """
    Generates an AI response suggestion for the conversation thread,
    querying RAG chunks context without inserting the response record.
    """
    try:
        conv_res = supabase_client.table("conversations").select("*, contacts(*)").eq("id", conversation_id).execute()
        if not conv_res.data:
            raise HTTPException(status_code=404, detail="Conversation not found.")
            
        conv = conv_res.data[0]
        contact = conv.get("contacts")
        
        # Load last client message content
        msg_res = supabase_client.table("messages") \
            .select("content") \
            .eq("conversation_id", conversation_id) \
            .eq("sender_type", "contact") \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
            
        last_message = "Hello"
        if msg_res.data:
            last_message = msg_res.data[0]["content"]

        from app.services.ai_engine import ai_engine_service
        result = ai_engine_service.generate_reply(
            message=last_message,
            conversation_id=conversation_id,
            org_id=conv["org_id"],
            contact=contact
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compile suggestion: {str(e)}")

