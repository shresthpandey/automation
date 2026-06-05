"""
ConverseOS — Rate Limiter
Sliding-window rate limiter with Redis backend (when configured)
and a thread-safe in-memory fallback using collections.defaultdict.

Usage:
    from app.utils.rate_limiter import rate_limiter

    if not rate_limiter.is_allowed("contact:917041190907:msg", max_calls=20, window_seconds=60):
        # silently drop or log
        ...
"""

import time
import threading
import logging
from collections import defaultdict
from typing import List

logger = logging.getLogger("rate_limiter")

# ──────────────────────────────────────────────────────────────────────────────
# Redis backend (optional — only imported when REDIS_URL is configured)
# ──────────────────────────────────────────────────────────────────────────────
try:
    import redis as _redis_module
    _redis_available = True
except ImportError:
    _redis_available = False


class _RedisBackend:
    """
    Sliding-window rate limiter backed by Redis sorted sets.
    Each key maps to a sorted set of timestamps (score = timestamp).
    Atomic via pipeline — safe for multi-process deployments.
    """

    def __init__(self, redis_url: str):
        self._client = _redis_module.from_url(redis_url, decode_responses=True)
        # Verify connection immediately
        self._client.ping()
        logger.info("[RateLimiter] Redis backend connected: %s", redis_url)

    def is_allowed(self, key: str, max_calls: int, window_seconds: int) -> bool:
        now = time.time()
        window_start = now - window_seconds

        pipe = self._client.pipeline()
        # Remove entries older than the window
        pipe.zremrangebyscore(key, "-inf", window_start)
        # Count remaining entries
        pipe.zcard(key)
        # Add current timestamp
        pipe.zadd(key, {str(now): now})
        # Set TTL so keys auto-expire
        pipe.expire(key, window_seconds + 5)
        results = pipe.execute()

        current_count: int = results[1]  # count BEFORE adding new entry
        return current_count < max_calls


class _InMemoryBackend:
    """
    Thread-safe sliding-window rate limiter using in-process memory.
    Suitable for single-process deployments (local dev, Railway single dyno).
    Timestamps are stored per key and pruned on every check.
    """

    def __init__(self):
        # key → list of float timestamps
        self._store: dict[str, List[float]] = defaultdict(list)
        self._lock = threading.Lock()
        logger.info("[RateLimiter] In-memory backend active (no Redis configured).")

    def is_allowed(self, key: str, max_calls: int, window_seconds: int) -> bool:
        now = time.time()
        window_start = now - window_seconds

        with self._lock:
            timestamps = self._store[key]

            # Prune expired timestamps (sliding window cleanup)
            pruned = [ts for ts in timestamps if ts > window_start]
            self._store[key] = pruned

            if len(pruned) >= max_calls:
                return False  # limit exceeded

            # Record this call
            self._store[key].append(now)
            return True

    def current_count(self, key: str, window_seconds: int) -> int:
        """Helper for logging — returns current window count."""
        now = time.time()
        window_start = now - window_seconds
        with self._lock:
            return sum(1 for ts in self._store.get(key, []) if ts > window_start)


# ──────────────────────────────────────────────────────────────────────────────
# Public RateLimiter — auto-selects backend
# ──────────────────────────────────────────────────────────────────────────────
class RateLimiter:
    """
    Auto-selects Redis (if REDIS_URL configured) or falls back to in-memory.
    Call is_allowed() before processing any incoming webhook event.
    """

    def __init__(self):
        self._backend: _RedisBackend | _InMemoryBackend = self._init_backend()

    def _init_backend(self) -> _RedisBackend | _InMemoryBackend:
        # Lazy import to avoid circular dependency at module load time
        try:
            from app.config import settings
            redis_url: str = getattr(settings, "redis_url", "") or ""
        except Exception:
            redis_url = ""

        if redis_url and _redis_available:
            try:
                return _RedisBackend(redis_url)
            except Exception as exc:
                logger.warning(
                    "[RateLimiter] Redis connection failed (%s) — falling back to in-memory.", str(exc)
                )
        return _InMemoryBackend()

    def is_allowed(self, key: str, max_calls: int, window_seconds: int) -> bool:
        """
        Returns True if the request is within limits, False if rate limited.
        Thread-safe. Never raises — always returns a bool.
        """
        try:
            return self._backend.is_allowed(key, max_calls, window_seconds)
        except Exception as exc:
            # On any unexpected backend error: allow the request (fail open)
            logger.error("[RateLimiter] Backend error (fail-open): %s", str(exc))
            return True

    def current_count(self, key: str, window_seconds: int) -> int:
        """Returns current window hit count (in-memory only — Redis returns 0)."""
        try:
            if isinstance(self._backend, _InMemoryBackend):
                return self._backend.current_count(key, window_seconds)
            return 0
        except Exception:
            return 0


# Singleton — shared across all request handlers
rate_limiter = RateLimiter()
