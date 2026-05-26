import uuid

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_operator, get_db, get_redis
from app.core.errors import rate_limited
from app.models.operator import Operator
from app.models.trip import TripDirection, TripStatus
from app.schemas.trip import (
    ArrivalRequest,
    DropoffLocationResponse,
    NotifyArrivalResponse,
    PublicTripResponse,
    TripAnnouncementResponse,
    TripCreate,
    TripResponse,
    TripUpdate,
)
from app.services.trip_service import (
    _to_trip_response_dict,
    build_announcement,
    complete_trip,
    compute_rate_display,
    compute_spots_remaining,
    create_trip,
    delete_trip,
    get_public_trip,
    get_trip,
    get_trip_stats,
    get_trips,
    notify_arrival_blast,
    process_arrival,
    update_trip,
)
from app.services.operator_service import update_onboarding_checklist

router = APIRouter(prefix="/trips", tags=["trips"])

_RATE_LIMIT_WINDOW = 60   # seconds
_RATE_LIMIT_MAX    = 60   # requests per window


# ── Rate-limit dependency (public endpoint only) ──────────────────────────────

async def _check_rate_limit(request: Request, redis=Depends(get_redis)) -> None:
    ip  = (request.client.host if request.client else None) or "unknown"
    key = f"rl:public_trip:{ip}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, _RATE_LIMIT_WINDOW)
    if count > _RATE_LIMIT_MAX:
        raise rate_limited()


# ── POST /trips ───────────────────────────────────────────────────────────────

@router.post("", response_model=TripResponse, status_code=201)
async def create(
    body: TripCreate,
    operator: Operator = Depends(get_current_operator),
    db: AsyncSession   = Depends(get_db),
    redis              = Depends(get_redis),
):
    trip = await create_trip(db, operator, body)

    # Mark first_trip_created in onboarding checklist (fire-and-forget)
    if not operator.onboarding_checklist.get("first_trip_created"):
        await update_onboarding_checklist(db, operator.id, "first_trip_created", True)
        # Update the in-memory operator so response is consistent
        operator.onboarding_checklist = {
            **operator.onboarding_checklist,
            "first_trip_created": True,
        }

    return TripResponse(**_to_trip_response_dict(trip))


# ── GET /trips ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TripResponse])
async def list_trips(
    status:    TripStatus    | None = None,
    direction: TripDirection | None = None,
    limit:     int                  = 20,
    offset:    int                  = 0,
    operator: Operator = Depends(get_current_operator),
    db: AsyncSession   = Depends(get_db),
):
    trips = await get_trips(
        db, operator.id,
        status=status, direction=direction,
        limit=min(limit, 100), offset=offset,
    )
    return [TripResponse(**_to_trip_response_dict(t)) for t in trips]


# ── GET /trips/public/{slug} — must be defined before /{trip_id} ─────────────

@router.get("/public/{slug}", response_model=PublicTripResponse, dependencies=[Depends(_check_rate_limit)])
async def get_public(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    trip = await get_public_trip(db, slug)
    spots = await compute_spots_remaining(db, trip)
    rate_display = compute_rate_display(
        trip.rate_per_kg,
        trip.currency,
        trip.operator.weight_unit.value,
    )
    return PublicTripResponse(
        id=trip.id,
        direction=trip.direction.value,
        direction_badge=_to_trip_response_dict(trip)["direction_badge"],
        origin_city=trip.origin_city,
        origin_country=trip.origin_country,
        destination_city=trip.destination_city,
        destination_country=trip.destination_country,
        departure_date=trip.departure_date,
        cutoff_date=trip.cutoff_date,
        status=trip.status.value,
        pricing_model=trip.pricing_model.value,
        rate_display=rate_display,
        rate_per_kg=trip.rate_per_kg,
        currency=trip.currency,
        capacity_kg=trip.capacity_kg,
        spots_remaining=spots,
        accepted_item_types=trip.accepted_item_types,
        customs_advisory=trip.customs_advisory,
        domestic_mailing_rate_per_lb=trip.domestic_mailing_rate_per_lb,
        public_slug=trip.public_slug,
        view_count=trip.view_count,
        pickup_location=trip.pickup_location,
        pickup_window=trip.pickup_window,
        pickup_notes=trip.pickup_notes,
        arrived_at=trip.arrived_at,
        operator_name=trip.operator.name,
        operator_business_name=trip.operator.business_name,
        operator_phone=trip.operator.phone,
        operator_mailing_address_line1=trip.operator.mailing_address_line1,
        operator_mailing_address_line2=trip.operator.mailing_address_line2,
        operator_mailing_city=trip.operator.mailing_city,
        operator_mailing_state=trip.operator.mailing_state,
        operator_mailing_zip=trip.operator.mailing_zip,
        operator_mailing_country=trip.operator.mailing_country,
        operator_mailing_instructions=trip.operator.mailing_instructions,
        drop_off_locations=[
            DropoffLocationResponse(
                id=loc.id,
                label=loc.label,
                address=loc.address,
                city=loc.city,
                state=loc.state,
                display_order=loc.display_order,
            )
            for loc in trip.drop_off_locations
        ],
    )


# ── GET /trips/{trip_id}/announcement ────────────────────────────────────────

@router.get("/{trip_id}/announcement", response_model=TripAnnouncementResponse)
async def get_announcement(
    trip_id: uuid.UUID,
    operator: Operator = Depends(get_current_operator),
    db: AsyncSession   = Depends(get_db),
):
    """Return a pre-formatted WhatsApp announcement message for the trip."""
    trip = await get_trip(db, trip_id, operator.id)
    return build_announcement(trip)


# ── GET /trips/{trip_id} ──────────────────────────────────────────────────────

@router.get("/{trip_id}", response_model=TripResponse)
async def get_one(
    trip_id: uuid.UUID,
    operator: Operator = Depends(get_current_operator),
    db: AsyncSession   = Depends(get_db),
):
    trip  = await get_trip(db, trip_id, operator.id)
    stats = await get_trip_stats(db, trip.id)
    return TripResponse(**_to_trip_response_dict(trip, booking_counts=stats))


# ── PATCH /trips/{trip_id} ────────────────────────────────────────────────────

@router.patch("/{trip_id}", response_model=TripResponse)
async def patch(
    trip_id: uuid.UUID,
    body: TripUpdate,
    operator: Operator = Depends(get_current_operator),
    db: AsyncSession   = Depends(get_db),
):
    from sqlalchemy import update as sa_update
    from app.models.booking import Booking, BookingStatus

    trip = await get_trip(db, trip_id, operator.id)
    trip = await update_trip(db, trip, body, operator)

    # When departing, move all received bookings → in_transit
    if body.status == TripStatus.in_transit:
        await db.execute(
            sa_update(Booking)
            .where(
                Booking.trip_id == trip.id,
                Booking.status == BookingStatus.received,
            )
            .values(status=BookingStatus.in_transit)
            .execution_options(synchronize_session=False)
        )

    # Commit + re-fetch so updated_at and operator are fresh (avoids MissingGreenlet)
    await db.commit()
    trip = await get_trip(db, trip_id, operator.id)
    return TripResponse(**_to_trip_response_dict(trip))


# ── DELETE /trips/{trip_id} ───────────────────────────────────────────────────

@router.delete("/{trip_id}", status_code=204)
async def remove(
    trip_id: uuid.UUID,
    operator: Operator = Depends(get_current_operator),
    db: AsyncSession   = Depends(get_db),
):
    trip = await get_trip(db, trip_id, operator.id)
    await delete_trip(db, trip)
    return Response(status_code=204)


# ── POST /trips/{trip_id}/arrive ──────────────────────────────────────────────

@router.post("/{trip_id}/arrive", response_model=TripResponse)
async def arrive(
    trip_id: uuid.UUID,
    body: ArrivalRequest,
    operator: Operator = Depends(get_current_operator),
    db: AsyncSession   = Depends(get_db),
):
    trip = await get_trip(db, trip_id, operator.id)
    trip = await process_arrival(db, trip, body)

    # Commit + re-fetch so updated_at and operator are fresh (avoids MissingGreenlet)
    await db.commit()
    trip = await get_trip(db, trip_id, operator.id)

    stats = await get_trip_stats(db, trip.id)
    return TripResponse(**_to_trip_response_dict(trip, booking_counts=stats))


# ── POST /trips/{trip_id}/notify-arrival ─────────────────────────────────────

@router.post("/{trip_id}/notify-arrival", response_model=NotifyArrivalResponse)
async def notify_arrival(
    trip_id: uuid.UUID,
    operator: Operator = Depends(get_current_operator),
    db: AsyncSession   = Depends(get_db),
):
    trip = await get_trip(db, trip_id, operator.id)
    sent, failed = await notify_arrival_blast(db, trip)
    await db.commit()
    return NotifyArrivalResponse(notified=sent, failed=failed)


# ── POST /trips/{trip_id}/complete ────────────────────────────────────────────

@router.post("/{trip_id}/complete", response_model=TripResponse)
async def complete(
    trip_id: uuid.UUID,
    operator: Operator = Depends(get_current_operator),
    db: AsyncSession   = Depends(get_db),
):
    trip = await get_trip(db, trip_id, operator.id)
    trip = await complete_trip(db, trip)
    # Commit + re-fetch so updated_at and operator are fresh (avoids MissingGreenlet)
    await db.commit()
    trip  = await get_trip(db, trip_id, operator.id)
    stats = await get_trip_stats(db, trip.id)
    return TripResponse(**_to_trip_response_dict(trip, booking_counts=stats))
