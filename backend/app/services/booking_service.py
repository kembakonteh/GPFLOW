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

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import not_found, validation_error, forbidden
from app.models.booking import Booking, BookingPackage, BookingStatus, CollectionType, PackageScanStatus, PaymentStatus
from app.models.operator import Operator
from app.models.operator_contact import OperatorContact
from app.models.trip import Trip, TripStatus
from app.schemas.booking import (
    BookingCreate,
    BookingResponse,
    BookingTrackingResponse,
    PackageResponse,
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

def _calculate_cost_minor(weight_kg, rate_per_kg) -> int:
    """Return cost in minor currency units (cents).

    Converts inputs via str() before creating Decimals so that float
    representations like 26.455439999999998 don't carry binary noise
    into the multiplication (which would otherwise round to $119.96
    instead of $120.00 for 10 lbs × $12/lb).
    """
    d_weight = Decimal(str(weight_kg))
    d_rate   = Decimal(str(rate_per_kg))
    cost     = (d_weight * d_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return int(cost * 100)


def _format_cost_display(minor: int | None, currency: str) -> str | None:
    """Return e.g. 'USD 28.50', or None if cost is unknown."""
    if minor is None:
        return None
    return f"{currency} {minor / 100:.2f}"


def _compute_totals(
    confirmed_cost_minor: int | None,
    mailing_fee_charged: Decimal | None,
) -> dict:
    """Return total_cost_minor and total_cost_usd, both None when cargo not yet confirmed."""
    if confirmed_cost_minor is None:
        return {"total_cost_minor": None, "total_cost_usd": None}
    mailing_cents = int((mailing_fee_charged * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)) if mailing_fee_charged is not None else 0
    total_minor = confirmed_cost_minor + mailing_cents
    return {"total_cost_minor": total_minor, "total_cost_usd": total_minor / 100.0}


# ── Query helpers ─────────────────────────────────────────────────────────────

def _with_relations(query):
    """Eagerly load trip (with operator), operator, and packages."""
    return query.options(
        selectinload(Booking.trip).selectinload(Trip.operator),
        selectinload(Booking.operator),
        selectinload(Booking.packages),
    )


async def _refetch_booking(db: AsyncSession, booking_id: uuid.UUID) -> Booking:
    """Re-fetch a booking with all relationships after a flush."""
    result = await db.execute(
        _with_relations(select(Booking).where(Booking.id == booking_id))
    )
    return result.scalar_one()


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
    pkgs = sorted(booking.packages, key=lambda p: p.package_number) if booking.packages else []
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
        package_count=booking.package_count,
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
        delivery_address_line1=booking.delivery_address_line1,
        delivery_address_line2=booking.delivery_address_line2,
        delivery_city=booking.delivery_city,
        delivery_state=booking.delivery_state,
        delivery_zip=booking.delivery_zip,
        delivery_country=booking.delivery_country,
        delivery_notes=booking.delivery_notes,
        mailing_fee_charged=booking.mailing_fee_charged,
        **_compute_totals(booking.confirmed_cost_minor, booking.mailing_fee_charged),
        created_at=booking.created_at,
        updated_at=booking.updated_at,
        trip_public_slug=trip.public_slug if trip else None,
        trip_departure_date=trip.departure_date if trip else None,
        trip_direction=trip.direction.value if trip else None,
        packages=[
            PackageResponse(
                id=p.id,
                package_number=p.package_number,
                description=p.description,
                package_reference=p.package_reference,
                weight_kg=p.weight_kg,
                qr_code=p.qr_code,
                scan_status=p.scan_status.value,
                scanned_at=p.scanned_at,
            )
            for p in pkgs
        ],
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

    pkg_count = max(1, body.package_count)
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
        package_count=pkg_count,
        estimated_weight_kg=body.estimated_weight_kg,
        estimated_cost_minor=estimated_minor,
        currency=trip.currency,
        status=BookingStatus.confirmed,
        collection_type=body.collection_type,
        payment_status=PaymentStatus.unpaid,
        delivery_address_line1=body.delivery_address_line1,
        delivery_address_line2=body.delivery_address_line2,
        delivery_city=body.delivery_city,
        delivery_state=body.delivery_state,
        delivery_zip=body.delivery_zip,
        delivery_country=body.delivery_country,
        delivery_notes=body.delivery_notes,
    )
    db.add(booking)
    # Flush now so booking.id is populated by the DB before BookingPackage rows
    # reference it — column default=uuid.uuid4 is only called at INSERT time,
    # so booking.id is None until this flush.
    await db.flush()

    pkg_list: list[BookingPackage] = []
    for i in range(pkg_count):
        pkg_list.append(BookingPackage(
            booking_id=booking.id,
            package_number=i + 1,
            package_reference=f"{ref}-P{i + 1}",
        ))
    db.add_all(pkg_list)

    await upsert_contact(db, trip.operator_id, body.sender_name, body.sender_phone)

    await db.flush()

    # Re-fetch with explicit eager loading (all relationships have lazy="raise")
    result = await db.execute(
        select(Booking)
        .options(selectinload(Booking.packages))
        .where(Booking.id == booking.id)
    )
    return result.scalar_one()


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
    await db.flush()
    return await _refetch_booking(db, booking.id)


async def update_mailing_fee(
    db: AsyncSession,
    booking_id: uuid.UUID,
    operator_id: uuid.UUID,
    mailing_fee_usd: Decimal,
) -> Booking:
    """Operator records the actual USPS/UPS mailing cost after delivery."""
    booking = await _get_booking_or_404(db, booking_id, operator_id)
    if booking.collection_type != CollectionType.operator_delivers:
        raise validation_error("Mailing fee can only be set for operator_delivers bookings")
    booking.mailing_fee_charged = mailing_fee_usd
    await db.flush()
    return await _refetch_booking(db, booking.id)


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

    await db.flush()
    return await _refetch_booking(db, booking.id)


async def process_weigh_in(
    db: AsyncSession,
    booking: Booking,
    body: WeighInRequest,
    operator: Operator,
) -> Booking:
    """
    Operator records the actual weight at drop-off.

    For single-package bookings the behaviour is unchanged.
    For multi-package bookings, body.package_id selects the specific package;
    booking totals are recomputed from the sum of all package weights, and
    booking.status moves to 'received' only when every package has been weighed.
    """
    trip = booking.trip

    if booking.packages:
        # ── Per-package path ──────────────────────────────────────────────
        if body.package_id is not None:
            pkg = next((p for p in booking.packages if p.id == body.package_id), None)
            if pkg is None:
                raise not_found("Package")
        elif len(booking.packages) == 1:
            pkg = booking.packages[0]
        else:
            raise validation_error("package_id is required for multi-package bookings")

        if pkg.weight_kg is not None:
            raise validation_error(f"Package {pkg.package_reference} has already been weighed")

        pkg.weight_kg   = body.confirmed_weight_kg
        pkg.scan_status = PackageScanStatus.received

        # Recompute booking totals from all package weights
        total_kg = sum(
            Decimal(str(p.weight_kg))
            for p in booking.packages
            if p.weight_kg is not None
        )
        booking.confirmed_weight_kg  = total_kg
        booking.confirmed_cost_minor = _calculate_cost_minor(total_kg, trip.rate_per_kg)

        if body.payment_status is not None:
            booking.payment_status = body.payment_status

        # Advance to received only when every package is weighed
        if all(p.weight_kg is not None for p in booking.packages):
            if booking.status == BookingStatus.confirmed:
                booking.status = BookingStatus.received

    else:
        # ── Legacy path for bookings created before packages feature ──────
        if booking.status != BookingStatus.confirmed:
            raise validation_error(
                f"Weigh-in is only valid for 'confirmed' bookings (current: {booking.status.value})"
            )
        confirmed_minor = _calculate_cost_minor(body.confirmed_weight_kg, trip.rate_per_kg)
        booking.confirmed_weight_kg  = body.confirmed_weight_kg
        booking.confirmed_cost_minor = confirmed_minor
        booking.status               = BookingStatus.received
        if body.payment_status is not None:
            booking.payment_status = body.payment_status

    await db.flush()
    return await _refetch_booking(db, booking.id)


async def process_scan(
    db: AsyncSession,
    booking: Booking,
    body: ScanRequest,
) -> Booking:
    """Operator scans the QR label — increments scan_count and records timestamp."""
    booking.scan_count      += 1
    booking.last_scanned_at  = datetime.now(UTC)
    await db.flush()
    return await _refetch_booking(db, booking.id)


async def process_package_scan(
    db: AsyncSession,
    package_reference: str,
    action: str,
    operator_id: uuid.UUID,
) -> tuple["Booking", "BookingPackage", bool]:
    """
    Resolve a package_reference → BookingPackage, mark its scan_status, and
    auto-update booking.status when all packages share the same scan state.
    Returns (booking, package, booking_fully_updated).
    """
    if action not in ("received", "delivered"):
        raise validation_error("action must be 'received' or 'delivered'")

    # Quick lookup to get the booking_id without loading everything
    ref_upper = package_reference.strip().upper()
    stub_result = await db.execute(
        select(BookingPackage).where(BookingPackage.package_reference == ref_upper)
    )
    stub = stub_result.scalar_one_or_none()
    if stub is None:
        raise not_found("Package")

    # Load the booking with full relations (validates operator ownership)
    booking = await _get_booking_or_404(db, stub.booking_id, operator_id)

    # Find the matching package inside the eagerly-loaded list so we update
    # the same in-memory object that booking.packages holds
    pkg = next((p for p in booking.packages if p.package_reference == ref_upper), None)
    if pkg is None:
        raise not_found("Package")

    now = datetime.now(UTC)
    pkg.scan_status = PackageScanStatus(action)
    pkg.scanned_at  = now
    booking.scan_count     += 1
    booking.last_scanned_at = now

    # Advance booking status when every package shares the new scan state
    target = PackageScanStatus(action)
    all_done = all(p.scan_status == target for p in booking.packages)
    if all_done:
        if action == "received" and booking.status == BookingStatus.confirmed:
            booking.status = BookingStatus.received
        elif action == "delivered":
            booking.status = BookingStatus.delivered

    await db.flush()
    booking = await _refetch_booking(db, booking.id)
    pkg = next(p for p in booking.packages if p.package_reference == ref_upper)
    return booking, pkg, all_done


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
