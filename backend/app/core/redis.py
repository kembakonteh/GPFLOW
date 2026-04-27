from arq.connections import ArqRedis, RedisSettings, create_pool

from app.core.config import settings


def _parse_redis_settings() -> RedisSettings:
    """Convert a redis:// URL string into an ARQ RedisSettings object."""
    from urllib.parse import urlparse

    parsed = urlparse(settings.REDIS_URL)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        password=parsed.password,
        database=int(parsed.path.lstrip("/") or 0),
    )


# Module-level cached pool — populated on first call
_pool: ArqRedis | None = None


async def get_redis_pool() -> ArqRedis:
    """Return a shared ARQ Redis pool, creating it on first access."""
    global _pool
    if _pool is None:
        _pool = await create_pool(_parse_redis_settings())
    return _pool


async def close_redis_pool() -> None:
    """Gracefully close the pool during app shutdown."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
