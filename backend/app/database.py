from supabase import create_client, Client
from app.config import settings

def get_supabase_client() -> Client:
    """
    Initializes a thread-safe Supabase python client session.
    Using the Service Role Key allows bypassing database RLS checks
    when processing WhatsApp webhooks or background agent tasks.
    """
    return create_client(settings.supabase_url, settings.supabase_service_key)

# Global singleton client
supabase_client: Client = get_supabase_client()
