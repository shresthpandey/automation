from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

# Import API Routers
from app.routers import webhooks, conversations, contacts, knowledge_base, ai, auth

app = FastAPI(
    title=settings.app_name,
    description="Omnichannel workspace & AI automation engine backend.",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url=None
)

# Cross-Origin Resource Sharing configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to client URL in production settings
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount sub-routers with standard prefixing
app.include_router(webhooks, prefix="/api/webhooks", tags=["Webhooks"])
app.include_router(conversations, prefix="/api/conversations", tags=["Conversations"])
app.include_router(contacts, prefix="/api/contacts", tags=["Contacts"])
app.include_router(knowledge_base, prefix="/api/knowledge-base", tags=["Knowledge Base"])
app.include_router(ai, prefix="/api/ai", tags=["AI Copilot Configuration"])
app.include_router(auth, prefix="/api/auth", tags=["Auth & Onboarding"])

@app.get("/")
async def root():
    return {
        "status": "healthy",
        "service": settings.app_name,
        "api_docs": "/docs" if settings.debug else "hidden"
    }
