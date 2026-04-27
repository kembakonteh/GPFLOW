from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_operator, get_db, get_redis
from app.core.errors import invalid_credentials, token_invalid
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    is_token_revoked,
    revoke_token,
    verify_password,
)
from app.core.config import settings
from app.models.operator import Operator
from app.schemas.operator import (
    AuthResponse,
    LoginRequest,
    LogoutRequest,
    OperatorResponse,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)
from app.services.operator_service import (
    create_operator,
    get_operator_by_email,
    get_operator_by_phone,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    from app.core.errors import email_taken, phone_taken

    # Uniqueness checks
    if await get_operator_by_email(db, body.email):
        raise email_taken()
    if await get_operator_by_phone(db, body.phone):
        raise phone_taken()

    # Persist
    operator = await create_operator(db, body)

    # Enqueue welcome WhatsApp notification (non-blocking)
    try:
        await redis.enqueue_job("send_welcome_operator_task", operator_id=str(operator.id))
    except Exception:
        pass  # never fail registration because the queue is unavailable

    # Issue tokens
    access_token  = create_access_token(str(operator.id))
    refresh_token = create_refresh_token(str(operator.id))

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        operator=OperatorResponse.model_validate(operator),
    )


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=AuthResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    operator = await get_operator_by_email(db, body.email)

    # Deliberate constant-time failure to prevent user enumeration
    if not operator or not verify_password(body.password, operator.password_hash):
        raise invalid_credentials()

    access_token  = create_access_token(str(operator.id))
    refresh_token = create_refresh_token(str(operator.id))

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        operator=OperatorResponse.model_validate(operator),
    )


# ── Refresh ───────────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    redis=Depends(get_redis),
):
    # Decode and type-check
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise token_invalid()

    # Revocation check
    jti = payload.get("jti", "")
    if jti and await is_token_revoked(jti, redis):
        raise token_invalid()

    operator_id: str | None = payload.get("sub")
    if not operator_id:
        raise token_invalid()

    return TokenResponse(access_token=create_access_token(operator_id))


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout", status_code=204)
async def logout(
    body: LogoutRequest,
    _operator: Operator = Depends(get_current_operator),  # auth required
    redis=Depends(get_redis),
):
    """
    Revoke the supplied refresh token by storing its JTI in Redis.
    Access tokens expire naturally — they cannot be revoked.
    """
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") == "refresh":
            jti = payload.get("jti")
            if jti:
                ttl = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
                await revoke_token(jti, ttl, redis)
    except Exception:
        pass  # idempotent — already expired/invalid tokens are fine

    return Response(status_code=204)
