"""
Business logic for the Bookings domain (Part 5).

Handles creation, status transitions, weigh-in, scan tracking,
cost calculation, and contact upsert.
"""

from __future__ import annotations

import random
import string
import uuid
from datetime import UTC, datetime
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import not_found, validation_error, forbidden
from app.models.booking import Booking, BookingStatus, CollectionType, PaymentStatus
from app.models.operator import Operator
from app.models.operator_contact import OperatorContact
from app.models.trip import Trip, TripStatus
from app.schemas.booking import (
    BookingCreate,
    BookingResponse,
    BookingTrackingResponse,
    PaymentUpdate,
    ScanRequest,
    StatusEvent,
    StatusUpdate,
    TripForTracking,
    WeighInRequest,
)


# ── Reference number generation ───────────────────────────────────────────────

_REF_CHARS = string.ascii_uppercase + string.digits


def _random_ref_suffix(length: int = 4) -> str:
    return "".join(random.choices(_REF_CHARS, k=length))


async def _generate_reference_number(db: AsyncSession) -> str:
    """Generate a unique booking reference: GP-YYYY-XXXX."""
    year = datetime.now(UTC).year
    for _ in range(20):
        suffix    = _random_ref_suffix()
        candidate = f"GP-{year}-{suffix}"
        result    = await db.execute(
            select(Booking.reference_number).where(Booking.reference_number == candidate)
        )
        if result.scalar_one_or_none() is None:
            return candidate
    raise RuntimeError("Could not generate a unique booking reference after 20 attempts")


# ── Cost helpers ──────────────────────────────────────────────────────────────

def _calculate_cost_minor(weight_kg: Decimal, rate_per_kg: Decimal) -> int:
    """Return cost in minor currency units (cents). Rounds half-up."""
    cost = (weight_kg * rate_per_kg).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return int(cost * 100)


def _format_cost_display(minor: int | None, currency: str) -> str | None:
    """Return e.g. 'USD 28.50', or None if cost is unknown."""
    if minor is None:
        return None
    return f"{currency} {minor / 100:.2f}"


# ── Query helpers ─────────────────────────────────────────────────────────────

def _with_relations(query):
    """Eagerly load trip (with operator) and operator."""
    return query.options(
        selectinload(Booking.trip).selectinload(Trip.operator),
        selectinload(Booking.operator),
    )


async def _get_booking_or_404(
    db: AsyncSession,
    booking_id: uuid.UUID,
    operator_id: uuid.UUID | None = None,
) -> Booking:
    stmt = _with_relations(select(Booking).where(Booking.id == booking_id))
    result = await db.execute(stmt)
    booking = result.scalar_one_or_none()
    if booking is None:
        raise not_found("Booking")
    if operator_id is not None and booking.operator_id != operator_id:
        raise not_found("Booking")   # don't leak existence to other operators
    return booking


# ── Response builder ──────────────────────────────────────────────────────────

def _to_booking_response(booking: Booking) -> BookingResponse:
    trip = booking.trip
    return BookingResponse(
        id=booking.id,
        trip_id=booking.trip_id,
        operator_id=booking.operator_id,
        reference_number=booking.reference_number,
        sender_name=booking.sender_name,
        sender_phone=booking.sender_phone,
        sender_email=booking.sender_email,
        recipient_name=booking.recipient_name,
        recipient_phone=booking.recipient_phone,
        recipient_city=booking.recipient_city,
        item_description=booking.item_description,
        quantity=booking.quantity,
        estimated_weight_kg=booking.estimated_weight_kg,
        confirmed_weight_kg=booking.confirmed_weight_kg,
        estimated_cost_display=_format_cost_display(booking.estimated_cost_minor, booking.currency),
        confirmed_cost_display=_format_cost_display(booking.confirmed_cost_minor, booking.currency),
        currency=booking.currency,
        status=booking.status.value,
        collection_type=booking.collection_type.value if booking.collection_type else None,
        payment_status=booking.payment_status.value,
        qr_label_generated=booking.qr_label_generated,
        qr_label_generated_at=booking.qr_label_generated_at,
        qr_label_url=booking.qr_label_url,
        last_scanned_at=booking.last_scanned_at,
        scan_count=booking.scan_count,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
        trip_public_slug=trip.public_slug if trip else None,
        trip_departure_date=trip.departure_date if trip else None,
        trip_direction=trip.direction.value if trip else None,
    )


# ── Status tracking timeline ──────────────────────────────────────────────────

_STATUS_LABELS: dict[BookingStatus, str] = {
    BookingStatus.confirmed:  "Booking confirmed",
    BookingStatus.received:   "Parcel received",
    BookingStatus.in_transit: "In transit",
    BookingStatus.ready:      "Ready for collection / delivery",
    BookingStatus.collected:  "Collected",
    BookingStatus.delivered:  "Delivered",
    BookingStatus.held:       "Held — awaiting next trip",
}

# Ordered statuses that form the main linear flow (held is a side-branch)
_STATUS_ORDER = [
    BookingStatus.confirmed,
    BookingStatus.received,
    BookingStatus.in_transit,
    BookingStatus.ready,
    BookingStatus.collected,
    BookingStatus.delivered,
]


def _build_timeline(current_status: BookingStatus) -> list[StatusEvent]:
    # For held packages show progress up to "ready", then a held note
    if current_status == BookingStatus.held:
        ready_idx = _STATUS_ORDER.index(BookingStatus.ready)
        events: list[StatusEvent] = []
        for i, st in enumerate(_STATUS_ORDER):
            events.append(StatusEvent(
                status=st.value,
                label=_STATUS_LABELS[st],
                occurred_at=datetime.now(UTC) if i <= ready_idx else None,
            ))
        events.append(StatusEvent(
            status=BookingStatus.held.value,
            label=_STATUS_LABELS[BookingStatus.held],
            occurred_at=datetime.now(UTC),
        ))
        return events

    current_idx = _STATUS_ORDER.index(current_status)
    events = []
    for i, st in enumerate(_STATUS_ORDER):
        events.append(StatusEvent(
            status=st.value,
            label=_STATUS_LABELS[st],
            occurred_at=None if i > current_idx else datetime.now(UTC),
        ))
    return events


# ── Service functions ─────────────────────────────────────────────────────────

async def create_booking(
    db: AsyncSession,
    body: BookingCreate,
) -> Booking:
    """
    Public endpoint — sender creates a booking on an open trip.
    Looks up the trip, validates status, calculates estimated cost, upserts contact.
    """
    # Load trip + operator
    result = await db.execute(
        select(Trip)
        .options(selectinload(Trip.operator))
        .where(Trip.id == body.trip_id)
    )
    trip = result.scalar_one_or_none()
    if trip is None:
        raise not_found("Trip")
    if trip.status not in (TripStatus.open, TripStatus.draft):
        raise validation_error("This trip is no longer accepting bookings")

    # Estimated cost
    estimated_minor = _calculate_cost_minor(body.estimated_weight_kg, trip.rate_per_kg)

    ref = await _generate_reference_number(db)

    booking = Booking(
        trip_id=trip.id,
        operator_id=trip.operator_id,
        reference_number=ref,
        sender_name=body.sender_name.strip(),
        sender_phone=body.sender_phone.strip(),
        sender_email=body.sender_email.strip() if body.sender_email else None,
        recipient_name=body.recipient_name.strip(),
        recipient_phone=body.recipient_phone.strip() if body.recipient_phone else None,
        recipient_city=body.recipient_city.strip(),
        item_description=body.item_description.strip(),
        quantity=body.quantity,
        estimated_weight_kg=body.estimated_weight_kg,
        estimated_cost_minor=estimated_minor,
        currency=trip.currency,
        status=BookingStatus.confirmed,
        payment_status=PaymentStatus.unpaid,
    )
    db.add(booking)

    # Upsert sender into operator's contact list
    await upsert_contact(db, trip.operator_id, body.sender_name, body.sender_phone)

    await db.commit()
    await db.refresh(booking)
    return booking


async def get_booking(
    db: AsyncSession,
    booking_id: uuid.UUID,
    operator_id: uuid.UUID,
) -> Booking:
    return await _get_booking_or_404(db, booking_id, operator_id)


async def get_bookings(
    db: AsyncSession,
    operator_id: uuid.UUID,
    *,
    trip_id: uuid.UUID | None = None,
    status: BookingStatus | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Booking]:
    stmt = _with_relations(
        select(Booking).where(Booking.operator_id == operator_id)
    )
    if trip_id is not None:
        stmt = stmt.where(Booking.trip_id == trip_id)
    if status is not None:
        stmt = stmt.where(Booking.status == status)
    stmt = stmt.order_by(Booking.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_booking_by_ref(
    db: AsyncSession,
    reference_number: str,
    operator_id: uuid.UUID,
) -> Booking:
    stmt = _with_relations(
        select(Booking).where(
            Booking.reference_number == reference_number.upper(),
            Booking.operator_id == operator_id,
        )
    )
    result = await db.execute(stmt)
    booking = result.scalar_one_or_none()
    if booking is None:
        raise not_found("Booking")
    return booking


async def update_payment_status(
    db: AsyncSession,
    booking: Booking,
    body: "PaymentUpdate",
) -> Booking:
    """Operator marks a booking as paid, unpaid, or refunded."""
    booking.payment_status = body.payment_status
    await db.commit()
    await db.refresh(booking)
    return booking


async def update_booking_status(
    db: AsyncSession,
    booking: Booking,
    body: StatusUpdate,
) -> Booking:
    """
    Manual status override by the operator.
    The confirmed→received transition is only allowed via weigh-in (process_weigh_in).
    """
    if body.status == BookingStatus.received and booking.status == BookingStatus.confirmed:
        raise validation_error(
            "Use the weigh-in endpoint to move a booking from 'confirmed' to 'received'"
        )

    booking.status = body.status
    if body.collection_type is not None:
        booking.collection_type = body.collection_type

    await db.commit()
    await db.refresh(booking)
    return booking


async def process_weigh_in(
    db: AsyncSession,
    booking: Booking,
    body: WeighInRequest,
    operator: Operator,
) -> Booking:
    """
    Operator records the actual weight at drop-off.
    Sets confirmed_weight_kg, recalculates cost, moves status to received.
    """
    if booking.status != BookingStatus.confirmed:
        raise validation_error(
            f"Weigh-in is only valid for 'confirmed' bookings (current: {booking.status.value})"
        )

    # Need rate — load trip if not already loaded
    trip = booking.trip
    confirmed_minor = _calculate_cost_minor(body.confirmed_weight_kg, trip.rate_per_kg)

    booking.confirmed_weight_kg = body.confirmed_weight_kg
    booking.confirmed_cost_minor = confirmed_minor
    booking.status = BookingStatus.received
    if body.payment_status is not None:
        booking.payment_status = body.payment_status

    await db.commit()
    await db.refresh(booking)
    return booking


async def process_scan(
    db: AsyncSession,
    booking: Booking,
    body: ScanRequest,
) -> Booking:
    """
    Operator scans the QR label — increments scan_count and records timestamp.
    """
    await db.execute(
        update(Booking)
        .where(Booking.id == booking.id)
        .values(
            scan_count=Booking.scan_count + 1,
            last_scanned_at=func.now(),
        )
    )
    await db.commit()
    await db.refresh(booking)
    return booking


async def get_booking_by_ref_public(
    db: AsyncSession,
    reference_number: str,
) -> Booking:
    """Public lookup by reference number (no operator filter)."""
    stmt = _with_relations(
        select(Booking).where(Booking.reference_number == reference_number.upper())
    )
    result = await db.execute(stmt)
    booking = result.scalar_one_or_none()
    if booking is None:
        raise not_found("Booking")
    return booking


def build_tracking_response(booking: Booking) -> BookingTrackingResponse:
    """Build the public tracking payload."""
    trip = booking.trip

    # Only show first name for privacy
    sender_first = booking.sender_name.split()[0] if booking.sender_name else "Sender"

    return BookingTrackingResponse(
        reference_number=booking.reference_number,
        sender_first_name=sender_first,
        recipient_city=booking.recipient_city,
        item_description=booking.item_description,
        status=booking.status.value,
        status_label=_STATUS_LABELS[booking.status],
        collection_type=booking.collection_type.value if booking.collection_type else None,
        pickup_location=trip.pickup_location if trip else None,
        pickup_window=trip.pickup_window if trip else None,
        trip=TripForTracking(
            direction=trip.direction.value,
            origin_city=trip.origin_city,
            destination_city=trip.destination_city,
            departure_date=trip.departure_date,
            status=trip.status.value,
        ),
        timeline=_build_timeline(booking.status),
        last_scanned_at=booking.last_scanned_at,
    )


# ── Contact upsert ────────────────────────────────────────────────────────────

async def upsert_contact(
    db: AsyncSession,
    operator_id: uuid.UUID,
    name: str,
    phone: str,
) -> None:
    """
    Add the sender to the operator's contact list if not already present.
    Matched by phone number (normalised — digits only).
    """
    digits_only = "".join(c for c in phone if c.isdigit())
    result = await db.execute(
        select(OperatorContact).where(
            OperatorContact.operator_id == operator_id,
            OperatorContact.phone == digits_only,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is None:
        contact = OperatorContact(
            operator_id=operator_id,
            name=name.strip(),
            phone=digits_only,
        )
        db.add(contact)
        # Flushed with the parent transaction; caller commits.
