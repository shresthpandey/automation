from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import supabase_client
from app.utils.error_handler import get_logger, register_exception_handlers

# Import API Routers
from app.routers import webhooks, conversations, contacts, knowledge_base, ai, auth

logger = get_logger("main")

app = FastAPI(
    title=settings.app_name,
    description="Omnichannel workspace & AI automation engine backend.",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url=None,
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


# ── Startup Health Check ─────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_health_check() -> None:
    logger.info("[Startup] ConverseOS backend initializing...")
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
    return {
        "status": "healthy",
        "service": settings.app_name,
        "api_docs": "/docs" if settings.debug else "hidden",
    }
