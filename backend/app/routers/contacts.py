from fastapi import APIRouter, HTTPException
from app.database import supabase_client
from app.models.schemas import ContactCreate, ContactResponse
from typing import List

router = APIRouter()

@router.get("/", response_model=List[ContactResponse])
async def get_contacts():
    """
    Retrieves all cataloged CRM contact directories.
    """
    res = supabase_client.table("contacts").select("*").order("name", desc=False).execute()
    return res.data or []

@router.post("/", response_model=ContactResponse)
async def create_contact(payload: ContactCreate):
    """
    Saves a custom contact profile manual upload directly to Supabase.
    """
    # Check if phone number is already registered
    dup = supabase_client.table("contacts").select("*").eq("phone", payload.phone).execute()
    if dup.data:
        raise HTTPException(status_code=400, detail="A contact with this phone number already exists.")
        
    res = supabase_client.table("contacts").insert(payload.model_dump()).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to write contact record.")
        
    return res.data[0]
