import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import and_, case, delete as sa_delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import forbidden, not_found, validation_error
from app.models.booking import Booking, BookingStatus, PaymentStatus
from app.models.operator import WeightUnit
from app.models.trip import Trip, TripDirection, TripDropoffLocation, TripStatus
from app.schemas.trip import ArrivalRequest, TripCreate, TripUpdate
from app.utils.slug import generate_trip_slug
from app.utils.units import KG_TO_LB

_KG_TO_LB = Decimal(str(KG_TO_LB))

# ── Country → emoji flag map ──────────────────────────────────────────────────
_FLAG: dict[str, str] = {
    "US": "🇺🇸",
    "GB": "🇬🇧",
    "GM": "🇬🇲",
    "GN": "🇬🇳",
    "SN": "🇸🇳",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def direction_badge(trip: Trip) -> str:
    if trip.direction == TripDirection.outbound:
        flag = _FLAG.get(trip.origin_country.upper(), trip.origin_country)
        return f"{flag} → 🇬🇲"
    flag = _FLAG.get(trip.destination_country.upper(), trip.destination_country)
    return f"🇬🇲 → {flag}"


def compute_rate_display(rate_per_kg: Decimal, currency: str, weight_unit: str) -> str:
    """Return a human-readable rate string in the operator's preferred unit."""
    symbols = {"USD": "$", "GBP": "£", "EUR": "€"}
    sym = symbols.get(currency.upper(), currency)
    if weight_unit == "lbs":
        rate_per_lb = rate_per_kg / _KG_TO_LB
        return f"{sym}{rate_per_lb:.2f}/lb"
    return f"{sym}{rate_per_kg:.2f}/kg"


def _to_trip_response_dict(trip: Trip, booking_counts: dict | None = None) -> dict:
    """
    Build the kwargs dict for TripResponse.
    Requires trip.operator to be loaded (selectinload).
    """
    return {
        "id":                  trip.id,
        "operator_id":         trip.operator_id,
        "direction":           trip.direction.value,
        "direction_badge":     direction_badge(trip),
        "origin_city":         trip.origin_city,
        "origin_country":      trip.origin_country,
        "destination_city":    trip.destination_city,
        "destination_country": trip.destination_country,
        "departure_date":      trip.departure_date,
        "cutoff_date":         trip.cutoff_date,
        "status":              trip.status.value,
        "pricing_model":       trip.pricing_model.value,
        "rate_per_kg":         trip.rate_per_kg,
        "currency":            trip.currency,
        "capacity_kg":         trip.capacity_kg,
        "accepted_item_types":  trip.accepted_item_types,
        "customs_advisory":     trip.customs_advisory,
        "domestic_mailing_fee": trip.domestic_mailing_fee,
        "public_slug":          trip.public_slug,
        "view_count":          trip.view_count,
        "pickup_location":     trip.pickup_location,
        "pickup_window":       trip.pickup_window,
        "pickup_notes":        trip.pickup_notes,
        "arrived_at":          trip.arrived_at,
        "arrival_notified_at": trip.arrival_notified_at,
        "created_at":          trip.created_at,
        "updated_at":          trip.updated_at,
        "operator_name":          trip.operator.name,
        "operator_business_name": trip.operator.business_name,
        "booking_counts":         booking_counts,
        "drop_off_locations": [
            {
                "id":            loc.id,
                "label":         loc.label,
                "address":       loc.address,
                "city":          loc.city,
                "state":         loc.state,
                "display_order": loc.display_order,
            }
            for loc in sorted(trip.drop_off_locations, key=lambda l: l.display_order)
        ],
    }


def _with_operator(stmt):
    """Eagerly load operator and drop_off_locations on every trip query."""
    return stmt.options(
        selectinload(Trip.operator),
        selectinload(Trip.drop_off_locations),
    )


# ── CRUD ──────────────────────────────────────────────────────────────────────

async def create_trip(
    db: AsyncSession,
    operator,               # Operator ORM instance
    data: TripCreate,
) -> Trip:
    # Convert rate: if operator displays lbs, input is per-lb → store per-kg
    rate_kg = (
        data.rate_per_kg * _KG_TO_LB
        if operator.weight_unit == WeightUnit.lbs
        else data.rate_per_kg
    )

    slug = await generate_trip_slug(operator.business_name, db)

    trip = Trip(
        id=uuid.uuid4(),
        operator_id=operator.id,
        direction=data.direction,
        origin_city=data.origin_city,
        origin_country=data.origin_country.upper(),
        destination_city=data.destination_city,
        destination_country=data.destination_country.upper(),
        departure_date=data.departure_date,
        cutoff_date=data.cutoff_date,
        status=TripStatus.open,
        pricing_model=data.pricing_model,
        rate_per_kg=rate_kg,
        currency=data.currency.upper(),
        capacity_kg=data.capacity_kg,
        accepted_item_types=data.accepted_item_types,
        customs_advisory=data.customs_advisory,
        domestic_mailing_fee=data.domestic_mailing_fee,
        public_slug=slug,
    )
    db.add(trip)

    for loc in data.drop_off_locations:
        db.add(TripDropoffLocation(
            id=uuid.uuid4(),
            trip_id=trip.id,
            label=loc.label,
            address=loc.address,
            city=loc.city,
            state=loc.state,
            display_order=loc.display_order,
        ))

    await db.flush()

    # Re-fetch with explicit eager loading so the returned object has all
    # relationships loaded and no attribute access can trigger a lazy-load
    # (which would raise MissingGreenlet in an async context).
    result = await db.execute(
        _with_operator(select(Trip).where(Trip.id == trip.id))
    )
    return result.scalar_one()


async def get_trip(
    db: AsyncSession,
    trip_id: uuid.UUID,
    operator_id: uuid.UUID,
) -> Trip:
    """Fetch a trip by ID and enforce ownership."""
    result = await db.execute(
        _with_operator(select(Trip).where(Trip.id == trip_id))
    )
    trip = result.scalar_one_or_none()
    if trip is None:
        raise not_found("Trip")
    if trip.operator_id != operator_id:
        raise forbidden()
    return trip


async def get_trips(
    db: AsyncSession,
    operator_id: uuid.UUID,
    *,
    status: TripStatus | None = None,
    direction: TripDirection | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[Trip]:
    stmt = _with_operator(
        select(Trip).where(Trip.operator_id == operator_id)
    )
    if status is not None:
        stmt = stmt.where(Trip.status == status)
    if direction is not None:
        stmt = stmt.where(Trip.direction == direction)
    stmt = stmt.order_by(Trip.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_trip(
    db: AsyncSession,
    trip: Trip,
    data: TripUpdate,
    operator,
) -> Trip:
    # Extract drop_off_locations before dumping (it's a relationship, not a column)
    new_locs = data.drop_off_locations if "drop_off_locations" in data.model_fields_set else None
    update_data = data.model_dump(exclude_unset=True, exclude={"drop_off_locations"})

    # Convert rate if operator uses lbs
    if "rate_per_kg" in update_data and operator.weight_unit == WeightUnit.lbs:
        update_data["rate_per_kg"] = update_data["rate_per_kg"] * _KG_TO_LB

    # Normalise country codes to uppercase
    for field in ("origin_country", "destination_country"):
        if field in update_data and update_data[field]:
            update_data[field] = update_data[field].upper()

    for field, value in update_data.items():
        setattr(trip, field, value)

    # Replace drop-off locations when explicitly provided
    if new_locs is not None:
        await db.execute(sa_delete(TripDropoffLocation).where(TripDropoffLocation.trip_id == trip.id))
        for loc in new_locs:
            db.add(TripDropoffLocation(
                id=uuid.uuid4(),
                trip_id=trip.id,
                label=loc.label,
                address=loc.address,
                city=loc.city,
                state=loc.state,
                display_order=loc.display_order,
            ))

    await db.flush()
    return trip


async def delete_trip(db: AsyncSession, trip: Trip) -> None:
    if trip.status != TripStatus.draft:
        raise validation_error("Only draft trips can be deleted")
    await db.delete(trip)
    await db.flush()


async def get_public_trip(db: AsyncSession, slug: str) -> Trip:
    """Fetch trip by public slug and atomically increment view_count."""
    result = await db.execute(
        _with_operator(select(Trip).where(Trip.public_slug == slug))
    )
    trip = result.scalar_one_or_none()
    if trip is None:
        raise not_found("Trip")

    # Atomic increment — avoids read-modify-write race condition.
    # synchronize_session=False prevents SQLAlchemy from expiring the in-memory
    # trip object (which would cause a MissingGreenlet error on the next attribute access).
    await db.execute(
        update(Trip)
        .where(Trip.id == trip.id)
        .values(view_count=Trip.view_count + 1)
        .execution_options(synchronize_session=False)
    )
    trip.view_count += 1   # keep the in-memory object consistent
    return trip


# ── Arrival ───────────────────────────────────────────────────────────────────

async def process_arrival(
    db: AsyncSession,
    trip: Trip,
    data: ArrivalRequest,
) -> Trip:
    if trip.status not in (TripStatus.in_transit, TripStatus.open, TripStatus.closed):
        raise validation_error("Trip must be in transit, open, or closed to mark as arrived")

    trip.status          = TripStatus.arrived
    trip.pickup_location = data.pickup_location
    trip.pickup_window   = data.pickup_window
    trip.pickup_notes    = data.pickup_notes or ""
    trip.arrived_at      = datetime.now(UTC)

    # Build assignment lookup: booking_id (str) → CollectionType
    assignments = {str(a.booking_id): a.collection_type for a in data.collection_assignments}

    # Update all in-transit bookings to "ready" and apply collection assignments
    result = await db.execute(
        select(Booking).where(
            and_(
                Booking.trip_id == trip.id,
                Booking.status == BookingStatus.in_transit,
            )
        )
    )
    bookings = result.scalars().all()
    for booking in bookings:
        booking.status = BookingStatus.ready
        ctype = assignments.get(str(booking.id))
        if ctype:
            booking.collection_type = ctype

    await db.flush()
    return trip


# ── Complete ──────────────────────────────────────────────────────────────────

async def complete_trip(db: AsyncSession, trip: Trip) -> Trip:
    """Mark trip completed — all bookings must be collected, delivered, or held-over."""
    _allowed = {BookingStatus.collected, BookingStatus.delivered, BookingStatus.held}

    blocking = await db.scalar(
        select(func.count(Booking.id)).where(
            and_(
                Booking.trip_id == trip.id,
                Booking.status.not_in(list(_allowed)),
            )
        )
    )
    if blocking:
        raise validation_error(
            f"{blocking} booking(s) are not yet collected or delivered"
        )

    trip.status = TripStatus.completed
    await db.flush()
    return trip


# ── Stats ─────────────────────────────────────────────────────────────────────

async def get_trip_stats(db: AsyncSession, trip_id: uuid.UUID) -> dict:
    """
    Single-query conditional aggregation for all booking counts and totals.
    Uses SQLAlchemy's case() to compute per-status counts in one round trip.
    """
    def _count_status(status: BookingStatus):
        return func.count(case((Booking.status == status, 1)))

    row = (
        await db.execute(
            select(
                func.count(Booking.id).label("total_bookings"),
                _count_status(BookingStatus.confirmed).label("confirmed_count"),
                _count_status(BookingStatus.received).label("received_count"),
                _count_status(BookingStatus.in_transit).label("in_transit_count"),
                _count_status(BookingStatus.ready).label("ready_count"),
                _count_status(BookingStatus.collected).label("collected_count"),
                _count_status(BookingStatus.delivered).label("delivered_count"),
                func.coalesce(
                    func.sum(Booking.estimated_weight_kg), 0
                ).label("total_weight_kg"),
                func.coalesce(
                    func.sum(
                        case(
                            (Booking.status == BookingStatus.delivered, Booking.confirmed_weight_kg),
                            else_=None,
                        )
                    ),
                    0,
                ).label("delivered_weight_kg"),
                func.coalesce(
                    func.sum(
                        case(
                            (Booking.payment_status == PaymentStatus.paid, Booking.confirmed_cost_minor),
                            else_=None,
                        )
                    ),
                    0,
                ).label("total_revenue_minor"),
            ).where(Booking.trip_id == trip_id)
        )
    ).one()

    return {
        "total_bookings":      int(row.total_bookings),
        "confirmed_count":     int(row.confirmed_count),
        "received_count":      int(row.received_count),
        "in_transit_count":    int(row.in_transit_count),
        "ready_count":         int(row.ready_count),
        "collected_count":     int(row.collected_count),
        "delivered_count":     int(row.delivered_count),
        "total_weight_kg":     float(row.total_weight_kg),
        "delivered_weight_kg": float(row.delivered_weight_kg),
        "total_revenue_minor": int(row.total_revenue_minor),
    }


def build_announcement(trip: Trip) -> dict:
    """
    Build a WhatsApp-ready announcement message for a trip.
    Requires trip.operator and trip.drop_off_locations to be loaded.
    """
    from app.core.config import settings

    def _fmt_date(d: date) -> str:
        return d.strftime("%A, %B") + f" {d.day}"

    dest_flag  = _FLAG.get(trip.destination_country.upper(), "")
    dest_label = f"{trip.destination_city} {dest_flag}".strip()

    rate = compute_rate_display(
        trip.rate_per_kg,
        trip.currency,
        trip.operator.weight_unit.value,
    )

    frontend_url = str(settings.FRONTEND_URL).rstrip("/")
    public_url   = f"{frontend_url}/trip/{trip.public_slug}"

    lines: list[str] = [
        f"✈️ *{trip.operator.business_name} — Trip to {dest_label}*",
        "",
        f"📅 Leaving: {_fmt_date(trip.departure_date)}",
        f"📦 Last day to send: {_fmt_date(trip.cutoff_date)}",
        f"💰 {rate}",
    ]

    locs = sorted(trip.drop_off_locations, key=lambda l: l.display_order)
    if locs:
        lines += ["", "📍 Drop-off Locations:"]
        lines += [f"• {loc.label}" for loc in locs]

    lines += [
        "",
        "📲 Book or track your parcel:",
        public_url,
        "",
        f"📞 Contact: {trip.operator.phone}",
    ]

    return {"whatsapp_message": "\n".join(lines), "public_url": public_url}


async def notify_arrival_blast(
    db: AsyncSession,
    trip: Trip,
) -> tuple[int, int]:
    """
    Send arrival WhatsApp notifications to all senders whose bookings made it.
    Queries ready/collected/delivered/held bookings, sends gpflow_arrived_sender
    to each, then stamps trip.arrival_notified_at.

    Returns (sent_count, failed_count).
    Never raises — notification errors are logged inside send_arrived_sender.
    """
    from app.services.notification_service import send_arrived_sender

    if trip.status not in (TripStatus.arrived, TripStatus.completed):
        raise validation_error("Trip must be arrived or completed to send arrival notifications")

    _arrived_statuses = [
        BookingStatus.ready,
        BookingStatus.collected,
        BookingStatus.delivered,
        BookingStatus.held,
    ]

    result = await db.execute(
        select(Booking)
        .where(
            and_(
                Booking.trip_id == trip.id,
                Booking.status.in_(_arrived_statuses),
            )
        )
        .options(
            selectinload(Booking.trip),
            selectinload(Booking.operator),
        )
    )
    bookings = result.scalars().all()

    sent = failed = 0
    for booking in bookings:
        ok = await send_arrived_sender(db, booking)
        if ok:
            sent += 1
        else:
            failed += 1

    trip.arrival_notified_at = datetime.now(UTC)
    return sent, failed


async def compute_spots_remaining(db: AsyncSession, trip: Trip) -> int | None:
    """Return remaining capacity in kg (integer floor), or None if uncapped."""
    if trip.capacity_kg is None:
        return None
    booked = await db.scalar(
        select(func.coalesce(func.sum(Booking.estimated_weight_kg), 0)).where(
            Booking.trip_id == trip.id
        )
    )
    remaining = float(trip.capacity_kg) - float(booked or 0)
    return max(0, int(remaining))
