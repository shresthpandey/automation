from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import supabase_client
from app.utils.error_handler import get_logger, register_exception_handlers

# Import API Routers
from app.routers import webhooks, conversations, contacts, knowledge_base, ai, auth

logger = get_logger("main")

is_prod = (settings.environment == "production")
app = FastAPI(
    title=settings.app_name,
    description="Omnichannel workspace & AI automation engine backend.",
    version="1.0.0",
    docs_url=None if is_prod else "/docs",
    redoc_url=None if is_prod else "/redoc",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global Exception Handlers ────────────────────────────────────────────────
register_exception_handlers(app)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(webhooks,      prefix="/api/webhooks",       tags=["Webhooks"])
app.include_router(conversations, prefix="/api/conversations",  tags=["Conversations"])
app.include_router(contacts,      prefix="/api/contacts",       tags=["Contacts"])
app.include_router(knowledge_base,prefix="/api/knowledge-base", tags=["Knowledge Base"])
app.include_router(ai,            prefix="/api/ai",             tags=["AI Copilot"])
app.include_router(auth,          prefix="/api/auth",           tags=["Auth & Onboarding"])


# ── Config Startup Validation ───────────────────────────────────────────────
@app.on_event("startup")
async def validate_config():
    missing = []
    # Check if required environment variables are present and not placeholders
    if not getattr(settings, "supabase_url", None) or "your-project" in settings.supabase_url:
        missing.append("SUPABASE_URL")
    if not getattr(settings, "supabase_service_key", None) or "your-service-role" in settings.supabase_service_key:
        missing.append("SUPABASE_SERVICE_KEY")
    if not getattr(settings, "openai_api_key", None) or "your-openai" in settings.openai_api_key:
        missing.append("OPENAI_API_KEY")
    if missing:
        raise RuntimeError(f"Missing or invalid env vars: {missing}")
    logger.info("✅ All required env vars present")


# ── Startup Health Check ─────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_health_check() -> None:
    logger.info("[Startup] ConverseOS backend initializing...")

    # Start idempotency cleanup background task
    from app.utils.idempotency import idempotency_checker
    idempotency_checker.start_cleanup_task()

    try:
        res = supabase_client.table("organizations").select("id").limit(1).execute()
        if res.data is not None:
            logger.info("[Startup] ✅ Supabase connection verified successfully.")
        else:
            logger.warning("[Startup] ⚠️ Supabase connection returned no data — check RLS policies.")
    except Exception as exc:
        logger.error("[Startup] ❌ Supabase connection FAILED: %s", str(exc))


# ── Health Endpoint ──────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health_check():
    """
    Public health probe for uptime monitors and Railway health checks.
    Returns Supabase connection status without exposing internal details.
    """
    supabase_status = "unknown"
    try:
        res = supabase_client.table("organizations").select("id").limit(1).execute()
        supabase_status = "connected" if res.data is not None else "no_data"
    except Exception:
        supabase_status = "error"

    return {
        "status": "ok",
        "service": settings.app_name,
        "supabase": supabase_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ── Root ─────────────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    is_prod = (settings.environment == "production")
    return {
        "status": "healthy",
        "service": settings.app_name,
        "api_docs": "hidden" if is_prod else "/docs",
    }
