import re
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, declared_attr

from app.core.config import settings


# ── Engine ────────────────────────────────────────────────────────────────────
# pool_pre_ping validates connections on checkout so stale sockets are recycled
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.ENVIRONMENT == "dev",
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# ── Session factory ───────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # keep attributes accessible after commit
    autoflush=False,
)


# ── Shared declarative base ───────────────────────────────────────────────────
class Base(DeclarativeBase):
    """
    All models inherit from this base.
    __tablename__ is auto-derived: CamelCase → snake_case + plural 's'.
      Operator          → operators
      TripUpdate        → trip_updates
      NotificationLog   → notification_logs
    """

    @declared_attr.directive
    def __tablename__(cls) -> str:  # noqa: N805
        # Two-pass regex: handles sequences like "TripUpdate" → "trip_update"
        s1 = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", cls.__name__)
        snake = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower()
        return snake + "s"


# ── FastAPI dependency ────────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
