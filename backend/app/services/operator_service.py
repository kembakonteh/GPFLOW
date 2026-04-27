import uuid

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.booking import Booking, BookingStatus, PaymentStatus
from app.models.operator import Operator
from app.models.trip import Trip, TripStatus
from app.schemas.operator import OperatorUpdate, RegisterRequest


# ── Create ────────────────────────────────────────────────────────────────────

async def create_operator(db: AsyncSession, data: RegisterRequest) -> Operator:
    operator = Operator(
        id=uuid.uuid4(),
        name=data.name,
        email=data.email.lower().strip(),
        phone=data.phone.strip(),
        password_hash=hash_password(data.password),
        business_name=data.business_name,
        country=data.country.upper(),
        city=data.city,
        weight_unit=data.weight_unit,
        onboarding_checklist={
            "profile_complete":       False,
            "first_trip_created":     False,
            "first_booking_received": False,
            "billing_setup":          False,
        },
    )
    db.add(operator)
    # flush so the row exists in the transaction before we return the ID
    await db.flush()
    return operator


# ── Read ──────────────────────────────────────────────────────────────────────

async def get_operator_by_email(db: AsyncSession, email: str) -> Operator | None:
    result = await db.execute(
        select(Operator).where(Operator.email == email.lower().strip())
    )
    return result.scalar_one_or_none()


async def get_operator_by_phone(db: AsyncSession, phone: str) -> Operator | None:
    result = await db.execute(
        select(Operator).where(Operator.phone == phone.strip())
    )
    return result.scalar_one_or_none()


async def get_operator_by_id(db: AsyncSession, operator_id: uuid.UUID) -> Operator | None:
    result = await db.execute(
        select(Operator).where(Operator.id == operator_id)
    )
    return result.scalar_one_or_none()


# ── Update ────────────────────────────────────────────────────────────────────

async def update_operator(
    db: AsyncSession, operator: Operator, data: OperatorUpdate
) -> Operator:
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(operator, field, value)
    await db.flush()
    return operator


async def update_onboarding_checklist(
    db: AsyncSession,
    operator_id: uuid.UUID,
    key: str,
    value: bool,
) -> Operator:
    """
    Patch a single key in the operator's onboarding_checklist JSONB.
    Must copy the dict to signal SQLAlchemy that the mutable column changed.
    """
    result = await db.execute(select(Operator).where(Operator.id == operator_id))
    operator = result.scalar_one()
    checklist = dict(operator.onboarding_checklist)   # copy — triggers change detection
    checklist[key] = value
    operator.onboarding_checklist = checklist
    await db.flush()
    return operator


def _profile_is_complete(operator: Operator) -> bool:
    """All required profile fields must be non-empty."""
    required = ["name", "business_name", "city", "country"]
    return all(getattr(operator, f, None) for f in required)


# ── Stats ─────────────────────────────────────────────────────────────────────

_ACTIVE_TRIP_STATUSES = [TripStatus.open, TripStatus.in_transit]


async def get_operator_stats(db: AsyncSession, operator_id: uuid.UUID) -> dict:
    # Run all five counts concurrently via individual scalar queries.
    # SQLAlchemy async doesn't support a single multi-result execute cleanly,
    # so we issue separate awaits — each is a cheap indexed lookup.

    total_trips = await db.scalar(
        select(func.count(Trip.id)).where(Trip.operator_id == operator_id)
    )

    active_trips = await db.scalar(
        select(func.count(Trip.id)).where(
            and_(
                Trip.operator_id == operator_id,
                Trip.status.in_(_ACTIVE_TRIP_STATUSES),
            )
        )
    )

    total_bookings = await db.scalar(
        select(func.count(Booking.id)).where(Booking.operator_id == operator_id)
    )

    total_revenue = await db.scalar(
        select(func.coalesce(func.sum(Booking.confirmed_cost_minor), 0)).where(
            and_(
                Booking.operator_id == operator_id,
                Booking.payment_status == PaymentStatus.paid,
            )
        )
    )

    pending_payments = await db.scalar(
        select(func.count(Booking.id)).where(
            and_(
                Booking.operator_id == operator_id,
                Booking.payment_status == PaymentStatus.unpaid,
            )
        )
    )

    items_in_transit = await db.scalar(
        select(func.count(Booking.id)).where(
            and_(
                Booking.operator_id == operator_id,
                Booking.status == BookingStatus.in_transit,
            )
        )
    )

    return {
        "total_trips":         int(total_trips        or 0),
        "active_trips":        int(active_trips       or 0),
        "total_bookings":      int(total_bookings     or 0),
        "total_revenue_minor": int(total_revenue      or 0),
        "pending_payments":    int(pending_payments   or 0),
        "items_in_transit":    int(items_in_transit   or 0),
    }
