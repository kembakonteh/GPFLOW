"""
Label API routes (Part 5).

GET  /labels/{booking_id}            — return label metadata (URL, generated_at)
POST /labels/{booking_id}/regenerate — force regenerate and re-upload
GET  /labels/{booking_id}/download   — redirect to presigned R2 download URL
"""

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_operator, get_db
from app.core.errors import not_found, validation_error
from app.models.operator import Operator
from app.schemas.booking import BookingResponse
from app.services.booking_service import get_booking, _to_booking_response
from app.services.label_service import generate_and_store_label, get_label_download_url

router = APIRouter(prefix="/labels", tags=["labels"])


# ── GET /labels/{booking_id} ──────────────────────────────────────────────────

@router.get("/{booking_id}", response_model=BookingResponse)
async def get_label_info(
    booking_id: uuid.UUID,
    operator:   Operator   = Depends(get_current_operator),
    db: AsyncSession       = Depends(get_db),
):
    """Return the booking with label metadata (url, generated_at, flag)."""
    booking = await get_booking(db, booking_id, operator.id)
    return _to_booking_response(booking)


# ── POST /labels/{booking_id}/regenerate ──────────────────────────────────────

@router.post("/{booking_id}/regenerate", response_model=BookingResponse)
async def regenerate(
    booking_id: uuid.UUID,
    operator:   Operator   = Depends(get_current_operator),
    db: AsyncSession       = Depends(get_db),
):
    """Force regenerate the QR label PDF and re-upload to R2."""
    booking = await get_booking(db, booking_id, operator.id)
    await generate_and_store_label(booking, db)
    # Refresh to pick up updated fields
    await db.refresh(booking)
    return _to_booking_response(booking)


# ── GET /labels/{booking_id}/download ────────────────────────────────────────

@router.get("/{booking_id}/download")
async def download(
    booking_id: uuid.UUID,
    operator:   Operator   = Depends(get_current_operator),
    db: AsyncSession       = Depends(get_db),
):
    """
    Redirect the caller to a short-lived presigned R2 URL for direct PDF download.
    Returns 302 Found → presigned URL (valid for 1 hour).
    """
    booking = await get_booking(db, booking_id, operator.id)

    if not booking.qr_label_generated or not booking.qr_label_url:
        raise validation_error("QR label has not been generated yet for this booking")

    presigned = get_label_download_url(str(booking.id), booking.reference_number)
    return RedirectResponse(url=presigned, status_code=302)
