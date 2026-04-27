from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_operator, get_db
from app.models.operator import Operator
from app.schemas.operator import OperatorResponse, OperatorStats, OperatorUpdate
from app.services.operator_service import (
    get_operator_stats,
    update_onboarding_checklist,
    update_operator,
    _profile_is_complete,
)

router = APIRouter(prefix="/operators", tags=["operators"])


# ── GET /me ───────────────────────────────────────────────────────────────────

@router.get("/me", response_model=OperatorResponse)
async def get_me(
    operator: Operator = Depends(get_current_operator),
):
    """Return the authenticated operator's full profile."""
    return OperatorResponse.model_validate(operator)


# ── PATCH /me ─────────────────────────────────────────────────────────────────

@router.patch("/me", response_model=OperatorResponse)
async def update_me(
    body: OperatorUpdate,
    operator: Operator = Depends(get_current_operator),
    db: AsyncSession = Depends(get_db),
):
    """
    Partial update — only supplied fields are written.
    Automatically marks profile_complete in the onboarding checklist
    once all required profile fields are filled.
    """
    operator = await update_operator(db, operator, body)

    # Mark profile step complete when all required fields are present
    if (
        not operator.onboarding_checklist.get("profile_complete")
        and _profile_is_complete(operator)
    ):
        operator = await update_onboarding_checklist(
            db, operator.id, "profile_complete", True
        )

    return OperatorResponse.model_validate(operator)


# ── GET /me/stats ─────────────────────────────────────────────────────────────

@router.get("/me/stats", response_model=OperatorStats)
async def get_my_stats(
    operator: Operator = Depends(get_current_operator),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate counts and revenue for the authenticated operator."""
    stats = await get_operator_stats(db, operator.id)
    return OperatorStats(**stats)
