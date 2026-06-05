"""
ConverseOS — Custom Exception Classes and Global Error Handlers
"""
import time
import traceback
import logging
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

# ──────────────────────────────────────────────
# Structured Logger Setup
# ──────────────────────────────────────────────
LOG_FORMAT = "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s"
logging.basicConfig(
    level=logging.INFO,
    format=LOG_FORMAT,
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)

def get_logger(module_name: str) -> logging.Logger:
    """Returns a consistently formatted logger for any module."""
    return logging.getLogger(module_name)


# ──────────────────────────────────────────────
# Custom Exception Classes
# ──────────────────────────────────────────────
class ConverseOSException(Exception):
    """Base exception for all ConverseOS domain errors."""
    def __init__(self, message: str, detail: str = ""):
        self.message = message
        self.detail = detail
        super().__init__(message)


class WhatsAppAPIError(ConverseOSException):
    """Raised when Meta WhatsApp Cloud API returns an error."""
    pass


class TwilioAPIError(ConverseOSException):
    """Raised when Twilio API returns an error."""
    pass


class OpenAIError(ConverseOSException):
    """Raised when OpenAI API call fails or times out."""
    pass


class SupabaseError(ConverseOSException):
    """Raised when a Supabase DB query fails."""
    pass


class RateLimitError(ConverseOSException):
    """Raised when any upstream API returns 429 Too Many Requests."""
    pass


# ──────────────────────────────────────────────
# Logging Helpers
# ──────────────────────────────────────────────
_err_logger = get_logger("error_handler")


def log_error(error_type: str, message: str, exc: Exception | None = None) -> None:
    """
    Logs a structured error entry with timestamp, type, message, and optional traceback.
    Never call this with user-facing or sensitive PII data.
    """
    tb = traceback.format_exc() if exc else ""
    _err_logger.error(
        "[%s] error_type=%s | msg=%s%s",
        datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        error_type,
        message,
        f"\n{tb}" if tb and tb.strip() != "NoneType: None" else "",
    )


# ──────────────────────────────────────────────
# Global FastAPI Exception Handlers
# ──────────────────────────────────────────────
def register_exception_handlers(app: FastAPI) -> None:
    """
    Registers all global exception handlers on the FastAPI application.
    Internal error details are never exposed in HTTP responses.
    """

    @app.exception_handler(WhatsAppAPIError)
    async def whatsapp_error_handler(request: Request, exc: WhatsAppAPIError):
        log_error("WhatsAppAPIError", exc.message)
        return JSONResponse(
            status_code=502,
            content={"error": "WhatsApp delivery failed. Please try again later."},
        )

    @app.exception_handler(TwilioAPIError)
    async def twilio_error_handler(request: Request, exc: TwilioAPIError):
        log_error("TwilioAPIError", exc.message)
        return JSONResponse(
            status_code=502,
            content={"error": "Twilio delivery failed. Please try again later."},
        )

    @app.exception_handler(OpenAIError)
    async def openai_error_handler(request: Request, exc: OpenAIError):
        log_error("OpenAIError", exc.message)
        return JSONResponse(
            status_code=503,
            content={"error": "AI service temporarily unavailable."},
        )

    @app.exception_handler(SupabaseError)
    async def supabase_error_handler(request: Request, exc: SupabaseError):
        log_error("SupabaseError", exc.message)
        return JSONResponse(
            status_code=503,
            content={"error": "Database temporarily unavailable."},
        )

    @app.exception_handler(RateLimitError)
    async def rate_limit_error_handler(request: Request, exc: RateLimitError):
        log_error("RateLimitError", exc.message)
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Please try again shortly."},
        )

    @app.exception_handler(ConverseOSException)
    async def converseos_error_handler(request: Request, exc: ConverseOSException):
        log_error("ConverseOSException", exc.message)
        return JSONResponse(
            status_code=500,
            content={"error": "An internal error occurred."},
        )

    @app.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception):
        log_error("UnhandledException", str(exc), exc)
        return JSONResponse(
            status_code=500,
            content={"error": "An unexpected error occurred."},
        )
