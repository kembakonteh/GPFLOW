from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db

bearer_scheme = HTTPBearer(auto_error=True)

# Redis key prefix for revoked JTIs
_REVOKE_PREFIX = "revoked:"


# ── Password hashing ──────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """Hash with bcrypt at 12 rounds."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── Token creation ────────────────────────────────────────────────────────────

def _build_token(subject: str, expires_delta: timedelta, extra: dict[str, Any] | None = None) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": now + expires_delta,
        "jti": str(uuid4()),        # unique ID — used for revocation
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(operator_id: str) -> str:
    return _build_token(
        subject=operator_id,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        extra={"type": "access"},
    )


def create_refresh_token(operator_id: str) -> str:
    return _build_token(
        subject=operator_id,
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        extra={"type": "refresh"},
    )


# ── Token verification ────────────────────────────────────────────────────────

def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT.
    Raises GPFlowError (not HTTPException) so callers can distinguish
    expired vs invalid tokens.
    """
    from app.core.errors import token_expired, token_invalid  # deferred to avoid circular import

    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except ExpiredSignatureError:
        raise token_expired()
    except JWTError:
        raise token_invalid()


def get_operator_id_from_token(token: str, token_type: str = "access") -> str:
    from app.core.errors import token_invalid

    payload = decode_token(token)
    if payload.get("type") != token_type:
        raise token_invalid()
    sub: str | None = payload.get("sub")
    if not sub:
        raise token_invalid()
    return sub


# ── Token revocation (Redis) ──────────────────────────────────────────────────

async def revoke_token(jti: str, ttl_seconds: int, redis) -> None:
    """Store a JTI in Redis to mark the token as revoked."""
    await redis.set(f"{_REVOKE_PREFIX}{jti}", "1", ex=ttl_seconds)


async def is_token_revoked(jti: str, redis) -> bool:
    """Return True if this JTI has been revoked."""
    return bool(await redis.exists(f"{_REVOKE_PREFIX}{jti}"))


# ── FastAPI dependency ────────────────────────────────────────────────────────

async def get_current_operator(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    Resolves the Bearer access token to a live Operator ORM instance.
    Does NOT check revocation — access tokens expire in 30 min naturally.
    """
    from app.core.errors import forbidden, not_found
    from app.models.operator import Operator  # deferred to avoid circular import

    operator_id = get_operator_id_from_token(credentials.credentials, token_type="access")

    result = await db.execute(select(Operator).where(Operator.id == operator_id))
    operator = result.scalar_one_or_none()

    if operator is None:
        raise not_found("Operator")
    # Only suspended accounts are blocked — onboarding operators have full API access
    from app.models.operator import OperatorStatus
    if operator.status == OperatorStatus.suspended:
        raise forbidden()
    return operator
