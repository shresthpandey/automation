"""
ConverseOS — Idempotency Checker

Provides a two-layer in-flight lock for webhook message processing:

  Layer 1 (In-flight lock): 
    Prevents the SAME webhook from being processed concurrently when
    Meta/Twilio fires it 2-3 times within 1 second.
    Uses an in-memory dict with timestamps → auto-expires after 30s.
    Redis sorted-set used when REDIS_URL is configured (multi-instance safe).

  Layer 2 (DB check in whatsapp.py):
    Queries messages table for existing channel_message_id before processing.
    DB unique index is the final hard guarantee.

Usage:
    from app.utils.idempotency import idempotency_checker

    if await idempotency_checker.is_processing(msg_id):
        return  # already in-flight
    await idempotency_checker.mark_processing(msg_id)
    try:
        ...process...
    finally:
        await idempotency_checker.mark_done(msg_id)
"""

import asyncio
import time
import threading
import logging
from typing import Optional

from app.utils.error_handler import get_logger

logger = get_logger("idempotency")

# Lock TTL — entries older than this are considered expired / stuck
LOCK_TTL_SECONDS = 30
# Cleanup interval — background task purges stale entries every N seconds
CLEANUP_INTERVAL_SECONDS = 60


# ──────────────────────────────────────────────────────────────────────────────
# In-Memory Backend
# ──────────────────────────────────────────────────────────────────────────────
class _InMemoryLock:
    """
    Thread-safe in-memory lock using a dict of {message_id → locked_at timestamp}.
    Entries auto-expire after LOCK_TTL_SECONDS so stuck locks never block forever.
    A background asyncio task cleans stale entries every CLEANUP_INTERVAL_SECONDS.
    """

    def __init__(self) -> None:
        # message_id → float (unix timestamp when lock was acquired)
        self._locks: dict[str, float] = {}
        self._thread_lock = threading.Lock()
        logger.info("[Idempotency] In-memory lock backend active.")

    def is_processing(self, message_id: str) -> bool:
        now = time.time()
        with self._thread_lock:
            locked_at = self._locks.get(message_id)
            if locked_at is None:
                return False
            # Treat as expired if older than TTL
            if now - locked_at > LOCK_TTL_SECONDS:
                del self._locks[message_id]
                logger.warning(
                    "[Idempotency] Stale lock expired for msg_id=%s (was held %.1fs)",
                    message_id,
                    now - locked_at,
                )
                return False
            return True

    def mark_processing(self, message_id: str) -> None:
        with self._thread_lock:
            self._locks[message_id] = time.time()

    def mark_done(self, message_id: str) -> None:
        with self._thread_lock:
            self._locks.pop(message_id, None)

    def cleanup_stale(self) -> int:
        """Remove all entries older than LOCK_TTL_SECONDS. Returns count removed."""
        now = time.time()
        with self._thread_lock:
            stale = [k for k, v in self._locks.items() if now - v > LOCK_TTL_SECONDS]
            for k in stale:
                del self._locks[k]
        if stale:
            logger.info("[Idempotency] Cleanup removed %d stale lock(s).", len(stale))
        return len(stale)


# ──────────────────────────────────────────────────────────────────────────────
# Redis Backend
# ──────────────────────────────────────────────────────────────────────────────
class _RedisLock:
    """
    Redis-backed idempotency lock using SET NX EX (atomic).
    Safe across multiple process replicas.
    """

    def __init__(self, redis_url: str) -> None:
        import redis as _redis_mod
        self._client = _redis_mod.from_url(redis_url, decode_responses=True)
        self._client.ping()
        self._prefix = "converseos:idempotency:"
        logger.info("[Idempotency] Redis lock backend connected: %s", redis_url)

    def _key(self, message_id: str) -> str:
        return f"{self._prefix}{message_id}"

    def is_processing(self, message_id: str) -> bool:
        return self._client.exists(self._key(message_id)) == 1

    def mark_processing(self, message_id: str) -> None:
        # SET key 1 NX EX ttl — only sets if not already present
        self._client.set(self._key(message_id), "1", nx=True, ex=LOCK_TTL_SECONDS)

    def mark_done(self, message_id: str) -> None:
        self._client.delete(self._key(message_id))

    def cleanup_stale(self) -> int:
        # Redis handles TTL automatically — no manual cleanup needed
        return 0


# ──────────────────────────────────────────────────────────────────────────────
# Public IdempotencyChecker
# ──────────────────────────────────────────────────────────────────────────────
class IdempotencyChecker:
    """
    Auto-selects Redis (if REDIS_URL configured) or in-memory backend.
    All public methods are async so callers can use await cleanly,
    even though the underlying operations are synchronous.
    """

    def __init__(self) -> None:
        self._backend: _InMemoryLock | _RedisLock = self._init_backend()
        self._cleanup_task: Optional[asyncio.Task] = None

    def _init_backend(self) -> _InMemoryLock | _RedisLock:
        try:
            from app.config import settings
            redis_url: str = getattr(settings, "redis_url", "") or ""
        except Exception:
            redis_url = ""

        if redis_url:
            try:
                import redis  # noqa: F401
                return _RedisLock(redis_url)
            except Exception as exc:
                logger.warning(
                    "[Idempotency] Redis unavailable (%s) — falling back to in-memory.", str(exc)
                )
        return _InMemoryLock()

    # ── Public API ─────────────────────────────────────────────────────────────

    async def is_processing(self, message_id: str) -> bool:
        """Returns True if this message_id is currently being processed."""
        if not message_id:
            return False
        try:
            return self._backend.is_processing(message_id)
        except Exception as exc:
            logger.error("[Idempotency] is_processing error (fail-open): %s", str(exc))
            return False  # fail open — don't block legitimate messages

    async def mark_processing(self, message_id: str) -> None:
        """Acquires the processing lock for message_id."""
        if not message_id:
            return
        try:
            self._backend.mark_processing(message_id)
        except Exception as exc:
            logger.error("[Idempotency] mark_processing error: %s", str(exc))

    async def mark_done(self, message_id: str) -> None:
        """Releases the processing lock for message_id."""
        if not message_id:
            return
        try:
            self._backend.mark_done(message_id)
        except Exception as exc:
            logger.error("[Idempotency] mark_done error: %s", str(exc))

    # ── Background Cleanup ─────────────────────────────────────────────────────

    async def _cleanup_loop(self) -> None:
        """Periodically purges stale in-memory locks. Runs as asyncio background task."""
        while True:
            await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
            try:
                self._backend.cleanup_stale()
            except Exception as exc:
                logger.error("[Idempotency] Cleanup loop error: %s", str(exc))

    def start_cleanup_task(self) -> None:
        """
        Starts the background cleanup coroutine.
        Call this from FastAPI startup event (only for in-memory backend).
        Redis handles TTL natively — no cleanup needed there.
        """
        if isinstance(self._backend, _InMemoryLock):
            try:
                loop = asyncio.get_event_loop()
                self._cleanup_task = loop.create_task(self._cleanup_loop())
                logger.info("[Idempotency] Background cleanup task started (interval=%ds).", CLEANUP_INTERVAL_SECONDS)
            except RuntimeError:
                # No event loop yet — will be started on first request
                pass


# Singleton
idempotency_checker = IdempotencyChecker()
