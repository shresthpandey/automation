from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# --- CONTACT SCHEMAS ---
class ContactBase(BaseModel):
    name: str = Field(..., min_length=1)
    phone: str = Field(..., description="Phone number with country code")
    email: Optional[str] = None
    avatar_url: Optional[str] = None

class ContactCreate(ContactBase):
    pass

class ContactResponse(ContactBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- MESSAGE SCHEMAS ---
class MessageCreate(BaseModel):
    content: str
    sender_type: str = Field("agent", pattern="^(customer|agent|bot)$")
    channel: Optional[str] = "whatsapp"

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_type: str
    content: str
    status: Optional[str] = "sent"
    channel: Optional[str] = "whatsapp"
    created_at: datetime

    class Config:
        from_attributes = True

# --- CONVERSATION SCHEMAS ---
class ConversationStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(open|snoozed|closed)$")

class ConversationResponse(BaseModel):
    id: str
    contact_id: str
    status: str
    unread_count: Optional[int] = 0
    last_message: Optional[str] = None
    last_message_at: datetime
    created_at: datetime
    contact: Optional[ContactResponse] = None

    class Config:
        from_attributes = True

# --- KNOWLEDGE BASE / RAG SCHEMAS ---
class DocumentCreate(BaseModel):
    title: str
    content: str

class DocumentResponse(BaseModel):
    id: str
    title: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- AI CONFIG SCHEMAS ---
class AISettingsUpdate(BaseModel):
    model_name: Optional[str] = "gpt-4o"
    temperature: Optional[float] = 0.3
    system_prompt: Optional[str] = "You are a helpful customer support agent."
    is_active: Optional[bool] = True

class ConversationUpdate(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    ai_enabled: Optional[bool] = None

