import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from app.database import supabase_client

# Setup logger configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("auth_router")

router = APIRouter()

class SetupOrgRequest(BaseModel):
    user_id: str = Field(..., description="Supabase Auth user UUID")
    full_name: str = Field(..., min_length=1)
    email: str
    org_name: Optional[str] = "My Business"

class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str = Field(..., min_length=1)
    org_name: Optional[str] = None

@router.post("/register")
async def register_user(payload: RegisterRequest):
    """
    Creates a new user via Supabase Admin Auth API (bypassing client-side rate limits and email verification)
    and configures the default organization.
    """
    logger.info(f"Registering new user: {payload.email}")
    org_name = payload.org_name or f"{payload.full_name}'s Workspace"
    
    try:
        # 1. Create user via Admin API
        user_res = supabase_client.auth.admin.create_user({
            "email": payload.email,
            "password": payload.password,
            "email_confirm": True,
            "user_metadata": {"full_name": payload.full_name}
        })
        
        if not user_res or not user_res.user:
            raise HTTPException(status_code=500, detail="Failed to create user account.")
            
        user_id = user_res.user.id
        
        # 2. Insert new Organization record
        org_res = supabase_client.table("organizations").insert({
            "name": org_name,
            "plan": "free",
            "settings": {}
        }).execute()
        
        if not org_res.data:
            # Clean up the created auth user
            supabase_client.auth.admin.delete_user(user_id)
            raise HTTPException(status_code=500, detail="Failed to create organization record.")
            
        org = org_res.data[0]
        org_id = org["id"]

        # 3. Insert new Profile linking auth user to organization
        profile_res = supabase_client.table("profiles").insert({
            "id": user_id,
            "org_id": org_id,
            "full_name": payload.full_name,
            "role": "admin"
        }).execute()
        
        if not profile_res.data:
            # Clean up
            supabase_client.table("organizations").delete().eq("id", org_id).execute()
            supabase_client.auth.admin.delete_user(user_id)
            raise HTTPException(status_code=500, detail="Failed to create user admin profile record.")
            
        logger.info(f"Registration and organization setup successful. user_id={user_id}, org_id={org_id}")
        return {
            "status": "success",
            "user_id": user_id,
            "org_id": org_id,
            "profile": profile_res.data[0]
        }
        
    except Exception as e:
        logger.error(f"Error during registration: {str(e)}", exc_info=True)
        detail = str(e)
        if "already registered" in detail.lower() or "user_already_exists" in detail.lower():
            raise HTTPException(status_code=400, detail="An account with this email address already exists.")
        raise HTTPException(status_code=500, detail=f"Registration failed: {detail}")

@router.post("/setup-org")
async def setup_organization(payload: SetupOrgRequest):
    """
    Called after Supabase Auth SignUp. Registers a new organization in database,
    and inserts the admin profile linked to the user's Supabase auth ID.
    """
    logger.info(f"Setting up organization '{payload.org_name}' for user {payload.user_id}")
    try:
        # 1. Insert new Organization record
        org_res = supabase_client.table("organizations").insert({
            "name": payload.org_name,
            "plan": "free",
            "settings": {}
        }).execute()
        
        if not org_res.data:
            raise HTTPException(status_code=500, detail="Failed to create organization record.")
            
        org = org_res.data[0]
        org_id = org["id"]

        # 2. Insert new Profile linking auth user to organization
        profile_res = supabase_client.table("profiles").insert({
            "id": payload.user_id,
            "org_id": org_id,
            "full_name": payload.full_name,
            "role": "admin"
        }).execute()
        
        if not profile_res.data:
            # Clean up organization to prevent orphan records
            supabase_client.table("organizations").delete().eq("id", org_id).execute()
            raise HTTPException(status_code=500, detail="Failed to create user admin profile record.")
            
        logger.info(f"Organization setup successful. org_id={org_id}")
        return {
            "status": "success",
            "org_id": org_id,
            "profile": profile_res.data[0]
        }
    except Exception as e:
        logger.error(f"Error setting up organization: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database setup failed: {str(e)}")
