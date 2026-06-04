from fastapi import APIRouter
from app.models.schemas import AISettingsUpdate
# Global config to simulate AI auto-reply activation state
COPILOT_CONFIG = {"is_active": True}


router = APIRouter()

@router.get("/settings")
async def get_settings():
    """
    Retrieves current Copilot Agent automation states.
    """
    return {
        "model_name": "gpt-4o",
        "temperature": 0.3,
        "system_prompt": "You are ConverseOS Copilot, an advanced business customer agent.",
        "is_active": COPILOT_CONFIG["is_active"]
    }

@router.post("/settings")
async def update_settings(payload: AISettingsUpdate):
    """
    Alters copilot system instruction rules and active statuses.
    """
    if payload.is_active is not None:
        COPILOT_CONFIG["is_active"] = payload.is_active
        
    return {
        "status": "updated",
        "settings": {
            "model_name": payload.model_name,
            "temperature": payload.temperature,
            "system_prompt": payload.system_prompt,
            "is_active": COPILOT_CONFIG["is_active"]
        }
    }
