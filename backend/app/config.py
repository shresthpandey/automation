import os
from typing import Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "ConverseOS Backend"
    debug: bool = True
    environment: str = "development"  # 'development' | 'production'
    
    # Required vars (no default)
    supabase_url: str
    supabase_service_key: str
    openai_api_key: str
    
    # Default/System WhatsApp Configuration (Fallback)
    whatsapp_token: Optional[str] = None
    whatsapp_verify_token: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None

    # Twilio Sandbox Configuration
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_whatsapp_number: Optional[str] = None

    # Redis (optional — leave empty to use in-memory rate limiter)
    redis_url: Optional[str] = None

    class Config:
        env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"

# Global Config Singleton
settings = Settings()
