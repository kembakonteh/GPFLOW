"""
Bookings API routes (Part 5).

Public endpoints (no auth):
  POST /bookings              — sender creates a booking
  GET  /bookings/track/{ref}  — public shipment tracking

Operator endpoints (auth required):
  GET  /bookings                    — list operator's bookings
  GET  /bookings/{id}               — get single booking
  GET  /bookings/by-ref/{ref}       — lookup by reference number
  PATCH /bookings/{id}/status       — update status
  POST  /bookings/{id}/weigh        — weigh-in (confirmed → received)
  POST  /bookings/{id}/scan         — record a QR scan checkpoint
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.core.dependencies import get_current_operator, get_db, get_redis
from app.models.booking import Booking, BookingStatus
from app.models.operator import Operator
from app.models.trip import Trip
from app.schemas.booking import (
    BookingCreate,
    BookingPublicResponse,
    BookingResponse,
    BookingTrackingResponse,
    PackagePublicResponse,
    PackageScanRequest,
    PackageScanResponse,
    PackageResponse,
    PaymentUpdate,
    ScanRequest,
    StatusUpdate,
    WeighInRequest,
)
from app.services.booking_service import (
    build_tracking_response,
    create_booking,
    get_booking,
    get_bookings,
    get_booking_by_ref,
    get_booking_by_ref_public,
    process_package_scan,
    process_scan,
    process_weigh_in,
    update_booking_status,
    update_payment_status,
    _to_booking_response,
)

router = APIRouter(prefix="/bookings", tags=["bookings"])


# ── POST /bookings — public, no auth ─────────────────────────────────────────

@router.post("", response_model=BookingPublicResponse, status_code=201)
async def create(
    body:    BookingCreate,
    db:      AsyncSession = Depends(get_db),
    redis                 = Depends(get_redis),
):
    booking = await create_booking(db, body)

    # Enqueue label generation in the background (fire-and-forget)
    try:
        await redis.enqueue_job(
            "generate_qr_label_task",
            booking_id=str(booking.id),
        )
    except Exception:
        pass  # never fail the HTTP response because the queue is unavailable

    # Enqueue booking confirmation WhatsApp notification to sender
    try:
        await redis.enqueue_job(
            "send_booking_confirmed_task",
            booking_id=str(booking.id),
        )
    except Exception:
        pass

    # Alert the operator on their first booking (check flag before enqueuing)
    try:
        from sqlalchemy import select as _select
        from app.models.operator import Operator as _Operator
        _res = await db.execute(_select(_Operator).where(_Operator.id == booking.operator_id))
        _op  = _res.scalar_one_or_none()
        if _op and not _op.onboarding_checklist.get("first_booking_received"):
            await redis.enqueue_job(
                "send_first_booking_alert_task",
                operator_id=str(booking.operator_id),
                booking_id=str(booking.id),
            )
            # Mark checklist (fire-and-forget — ignore failure)
            from app.services.operator_service import update_onboarding_checklist as _uoc
            await _uoc(db, booking.operator_id, "first_booking_received", True)
    except Exception:
        pass

    est_cost = None
    if booking.estimated_cost_minor is not None:
        est_cost = f"{booking.currency} {booking.estimated_cost_minor / 100:.2f}"

    return BookingPublicResponse(
        id=booking.id,
        reference_number=booking.reference_number,
        trip_id=booking.trip_id,
        status=booking.status.value,
        estimated_cost_display=est_cost,
        currency=booking.currency,
        sender_name=booking.sender_name,
        recipient_name=booking.recipient_name,
        recipient_city=booking.recipient_city,
        item_description=booking.item_description,
        estimated_weight_kg=booking.estimated_weight_kg,
        package_count=booking.package_count,
        packages=[
            PackagePublicResponse(
                package_number=p.package_number,
                package_reference=p.package_reference,
                description=p.description,
            )
            for p in sorted(booking.packages, key=lambda p: p.package_number)
        ],
        delivery_address_line1=booking.delivery_address_line1,
        delivery_address_line2=booking.delivery_address_line2,
        delivery_city=booking.delivery_city,
        delivery_state=booking.delivery_state,
        delivery_zip=booking.delivery_zip,
        delivery_country=booking.delivery_country,
        delivery_notes=booking.delivery_notes,
    )


# ── GET /bookings — operator, authenticated ────────────────────────────────

@router.get("", response_model=list[BookingResponse])
async def list_bookings(
    trip_id: uuid.UUID    | None = None,
    status:  BookingStatus | None = None,
    limit:   int                  = Query(50, ge=1, le=200),
    offset:  int                  = Query(0,  ge=0),
    operator: Operator    = Depends(get_current_operator),
    db: AsyncSession      = Depends(get_db),
):
    bookings = await get_bookings(
        db, operator.id,
        trip_id=trip_id,
        status=status,
        limit=limit,
        offset=offset,
    )
    return [_to_booking_response(b) for b in bookings]


# ── GET /bookings/by-ref/{ref} — must be before /{id} ────────────────────────

@router.get("/by-ref/{ref}", response_model=BookingResponse)
async def get_by_ref(
    ref:      str,
    operator: Operator   = Depends(get_current_operator),
    db: AsyncSession     = Depends(get_db),
):
    booking = await get_booking_by_ref(db, ref, operator.id)
    return _to_booking_response(booking)


# ── GET /bookings/track/{ref} — public tracking ────────────────────────────

@router.get("/track/{ref}", response_model=BookingTrackingResponse)
async def track(
    ref: str,
    db:  AsyncSession = Depends(get_db),
):
    booking = await get_booking_by_ref_public(db, ref)
    return build_tracking_response(booking)


# ── GET /bookings/{id} ────────────────────────────────────────────────────────

@router.get("/{booking_id}", response_model=BookingResponse)
async def get_one(
    booking_id: uuid.UUID,
    operator:   Operator   = Depends(get_current_operator),
    db: AsyncSession       = Depends(get_db),
):
    booking = await get_booking(db, booking_id, operator.id)
    return _to_booking_response(booking)


# ── PATCH /bookings/{id}/status ───────────────────────────────────────────────

@router.patch("/{booking_id}/status", response_model=BookingResponse)
async def set_status(
    booking_id: uuid.UUID,
    body:       StatusUpdate,
    operator:   Operator   = Depends(get_current_operator),
    db: AsyncSession       = Depends(get_db),
    redis                  = Depends(get_redis),
):
    from app.models.booking import BookingStatus as _BS

    booking = await get_booking(db, booking_id, operator.id)
    booking = await update_booking_status(db, booking, body)

    # Fire WhatsApp notification based on the new status
    try:
        if body.status == _BS.collected:
            await redis.enqueue_job("send_collected_task", booking_id=str(booking.id))
        elif body.status == _BS.delivered:
            await redis.enqueue_job("send_delivered_task", booking_id=str(booking.id))
    except Exception:
        pass

    return _to_booking_response(booking)


# ── PATCH /bookings/{id}/payment ─────────────────────────────────────────────

@router.patch("/{booking_id}/payment", response_model=BookingResponse)
async def set_payment(
    booking_id: uuid.UUID,
    body:       PaymentUpdate,
    operator:   Operator   = Depends(get_current_operator),
    db: AsyncSession       = Depends(get_db),
):
    booking = await get_booking(db, booking_id, operator.id)
    booking = await update_payment_status(db, booking, body)
    return _to_booking_response(booking)


# ── POST /bookings/{id}/weigh ─────────────────────────────────────────────────

@router.post("/{booking_id}/weigh", response_model=BookingResponse)
async def weigh_in(
    booking_id: uuid.UUID,
    body:       WeighInRequest,
    operator:   Operator   = Depends(get_current_operator),
    db: AsyncSession       = Depends(get_db),
    redis                  = Depends(get_redis),
):
    booking = await get_booking(db, booking_id, operator.id)
    booking = await process_weigh_in(db, booking, body, operator)

    # Send WhatsApp notification only when the booking is fully received
    # (for multi-package bookings this fires once — after the last package)
    if booking.status.value == "received":
        try:
            await redis.enqueue_job(
                "send_item_received_task",
                booking_id=str(booking.id),
            )
        except Exception:
            pass

    return _to_booking_response(booking)


# ── POST /bookings/packages/scan — must be before /{booking_id}/scan ──────────

@router.post("/packages/scan", response_model=PackageScanResponse)
async def scan_package(
    body:     PackageScanRequest,
    operator: Operator   = Depends(get_current_operator),
    db: AsyncSession     = Depends(get_db),
):
    """Resolve a package_reference to a package, mark scan_status, auto-update booking."""
    booking, pkg, all_done = await process_package_scan(
        db, body.package_reference, body.action, operator.id
    )
    return PackageScanResponse(
        booking=_to_booking_response(booking),
        package=PackageResponse(
            id=pkg.id,
            package_number=pkg.package_number,
            description=pkg.description,
            package_reference=pkg.package_reference,
            weight_kg=pkg.weight_kg,
            qr_code=pkg.qr_code,
            scan_status=pkg.scan_status.value,
            scanned_at=pkg.scanned_at,
        ),
        booking_fully_updated=all_done,
    )


# ── POST /bookings/{id}/scan ──────────────────────────────────────────────────

@router.post("/{booking_id}/scan", response_model=BookingResponse)
async def scan(
    booking_id: uuid.UUID,
    body:       ScanRequest,
    operator:   Operator   = Depends(get_current_operator),
    db: AsyncSession       = Depends(get_db),
):
    booking = await get_booking(db, booking_id, operator.id)
    booking = await process_scan(db, booking, body)
    return _to_booking_response(booking)
