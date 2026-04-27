"""
Shared FastAPI dependencies.
Import from here rather than from individual core modules
to keep route files clean.
"""

from app.core.database import get_db as get_db          # noqa: F401  re-export
from app.core.security import get_current_operator       # noqa: F401  re-export


async def get_redis():
    """FastAPI dependency that returns the shared ARQ Redis pool."""
    from app.core.redis import get_redis_pool
    return await get_redis_pool()
