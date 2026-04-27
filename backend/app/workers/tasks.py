"""
ARQ background task definitions — main worker.

Run the main worker with:
    arq app.workers.tasks.WorkerSettings

Run the notification worker with:
    arq app.workers.notification_worker.WorkerSettings

Each function receives `ctx` as its first argument (the ARQ worker context),
followed by keyword arguments passed to `redis.enqueue_job(...)`.

Retry strategy: on transient failure raise Retry(defer=60) for up to 3 attempts.
ARQ tracks attempt count in ctx["job_try"] (1-based).
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse

from arq.connections import RedisSettings

log = logging.getLogger(__name__)

_MAX_TRIES = 3
_RETRY_DEFER = 60   # seconds


# ── Shared DB session factory ─────────────────────────────────────────────────

def _make_session():
    """Return a new AsyncSession for use inside a worker task."""
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker
    from app.core.config import settings

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    return sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)()


def _booking_query(booking_id_val):
    """Return a select() for a single Booking with all notification relations loaded."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.booking import Booking
    from app.models.trip import Trip

    return (
        select(Booking)
        .options(
            selectinload(Booking.trip).selectinload(Trip.operator),
            selectinload(Booking.operator),
        )
        .where(Booking.id == booking_id_val)
    )


# ── QR label task ─────────────────────────────────────────────────────────────

async def generate_qr_label_task(
    ctx: dict,
    *,
    booking_id: str,
) -> None:
    """
    Generate the QR label PDF for a booking and upload it to R2.
    Creates its own DB session; errors are logged, never re-raised.
    """
    import uuid as _uuid

    log.info("[ARQ:label] generate_qr_label_task booking=%s try=%d", booking_id, ctx["job_try"])

    session = _make_session()
    try:
        from app.services.label_service import generate_and_store_label

        result = await session.execute(_booking_query(_uuid.UUID(booking_id)))
        booking = result.scalar_one_or_none()
        if booking is None:
            log.warning("[ARQ:label] Booking %s not found — skipping", booking_id)
            return

        url = await generate_and_store_label(booking, session)
        log.info("[ARQ:label] Done: %s → %s", booking_id, url)

    except Exception as exc:
        log.exception("[ARQ:label] FAILED booking=%s: %s", booking_id, exc)
        _maybe_retry(ctx, exc)
    finally:
        await session.close()


# ── Notification tasks ────────────────────────────────────────────────────────

async def send_booking_confirmed_task(
    ctx: dict,
    *,
    booking_id: str,
) -> None:
    """Send 'gpflow_booking_confirmed' to the sender after booking creation."""
    import uuid as _uuid
    from app.services.notification_service import send_booking_confirmed

    log.info("[ARQ:notif] send_booking_confirmed booking=%s try=%d", booking_id, ctx["job_try"])
    session = _make_session()
    try:
        result  = await session.execute(_booking_query(_uuid.UUID(booking_id)))
        booking = result.scalar_one_or_none()
        if booking is None:
            log.warning("[ARQ:notif] Booking %s not found", booking_id)
            return
        await send_booking_confirmed(session, booking)
    except Exception as exc:
        log.exception("[ARQ:notif] send_booking_confirmed FAILED booking=%s: %s", booking_id, exc)
        _maybe_retry(ctx, exc)
    finally:
        await session.close()


async def send_item_received_task(
    ctx: dict,
    *,
    booking_id: str,
) -> None:
    """Send 'gpflow_item_received' to the sender after weigh-in."""
    import uuid as _uuid
    from app.services.notification_service import send_item_received

    log.info("[ARQ:notif] send_item_received booking=%s try=%d", booking_id, ctx["job_try"])
    session = _make_session()
    try:
        result  = await session.execute(_booking_query(_uuid.UUID(booking_id)))
        booking = result.scalar_one_or_none()
        if booking is None:
            log.warning("[ARQ:notif] Booking %s not found", booking_id)
            return
        await send_item_received(session, booking)
    except Exception as exc:
        log.exception("[ARQ:notif] send_item_received FAILED booking=%s: %s", booking_id, exc)
        _maybe_retry(ctx, exc)
    finally:
        await session.close()


async def send_trip_departed_task(
    ctx: dict,
    *,
    trip_id: str,
) -> None:
    """
    Fan-out 'gpflow_trip_departed' to every sender on an in-transit trip.
    Queries for all bookings in 'in_transit' status for the given trip.
    """
    import uuid as _uuid
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.booking import Booking, BookingStatus
    from app.models.trip import Trip
    from app.services.notification_service import send_trip_departed

    log.info("[ARQ:notif] send_trip_departed_task trip=%s try=%d", trip_id, ctx["job_try"])
    session = _make_session()
    try:
        tid    = _uuid.UUID(trip_id)
        result = await session.execute(
            select(Booking)
            .options(
                selectinload(Booking.trip).selectinload(Trip.operator),
                selectinload(Booking.operator),
            )
            .where(
                Booking.trip_id == tid,
                Booking.status  == BookingStatus.in_transit,
            )
        )
        bookings = result.scalars().all()
        log.info("[ARQ:notif] Sending trip_departed to %d senders for trip=%s", len(bookings), trip_id)
        for booking in bookings:
            await send_trip_departed(session, booking)
    except Exception as exc:
        log.exception("[ARQ:notif] send_trip_departed_task FAILED trip=%s: %s", trip_id, exc)
        _maybe_retry(ctx, exc)
    finally:
        await session.close()


async def send_arrival_blast_task(
    ctx: dict,
    *,
    trip_id: str,
    operator_id: str,
) -> None:
    """
    Fan-out 'gpflow_arrived_sender' to every sender whose booking is 'ready'.
    Called when the operator marks a trip as arrived.
    """
    import uuid as _uuid
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.booking import Booking, BookingStatus
    from app.models.trip import Trip
    from app.services.notification_service import send_arrived_sender

    log.info("[ARQ:notif] send_arrival_blast_task trip=%s try=%d", trip_id, ctx["job_try"])
    session = _make_session()
    try:
        tid    = _uuid.UUID(trip_id)
        result = await session.execute(
            select(Booking)
            .options(
                selectinload(Booking.trip).selectinload(Trip.operator),
                selectinload(Booking.operator),
            )
            .where(
                Booking.trip_id == tid,
                Booking.status  == BookingStatus.ready,
            )
        )
        bookings = result.scalars().all()
        log.info("[ARQ:notif] Sending arrival_blast to %d senders for trip=%s", len(bookings), trip_id)
        for booking in bookings:
            await send_arrived_sender(session, booking)
    except Exception as exc:
        log.exception("[ARQ:notif] send_arrival_blast_task FAILED trip=%s: %s", trip_id, exc)
        _maybe_retry(ctx, exc)
    finally:
        await session.close()


async def send_collected_task(
    ctx: dict,
    *,
    booking_id: str,
) -> None:
    """Send 'gpflow_item_collected' to the sender after collection."""
    import uuid as _uuid
    from app.services.notification_service import send_collected

    log.info("[ARQ:notif] send_collected booking=%s try=%d", booking_id, ctx["job_try"])
    session = _make_session()
    try:
        result  = await session.execute(_booking_query(_uuid.UUID(booking_id)))
        booking = result.scalar_one_or_none()
        if booking is None:
            log.warning("[ARQ:notif] Booking %s not found", booking_id)
            return
        await send_collected(session, booking)
    except Exception as exc:
        log.exception("[ARQ:notif] send_collected FAILED booking=%s: %s", booking_id, exc)
        _maybe_retry(ctx, exc)
    finally:
        await session.close()


async def send_delivered_task(
    ctx: dict,
    *,
    booking_id: str,
) -> None:
    """Send 'gpflow_item_delivered' to the sender after delivery."""
    import uuid as _uuid
    from app.services.notification_service import send_delivered

    log.info("[ARQ:notif] send_delivered booking=%s try=%d", booking_id, ctx["job_try"])
    session = _make_session()
    try:
        result  = await session.execute(_booking_query(_uuid.UUID(booking_id)))
        booking = result.scalar_one_or_none()
        if booking is None:
            log.warning("[ARQ:notif] Booking %s not found", booking_id)
            return
        await send_delivered(session, booking)
    except Exception as exc:
        log.exception("[ARQ:notif] send_delivered FAILED booking=%s: %s", booking_id, exc)
        _maybe_retry(ctx, exc)
    finally:
        await session.close()


async def send_welcome_operator_task(
    ctx: dict,
    *,
    operator_id: str,
) -> None:
    """Send 'gpflow_welcome_operator' to a newly registered operator."""
    import uuid as _uuid
    from sqlalchemy import select
    from app.models.operator import Operator
    from app.services.notification_service import send_welcome_operator

    log.info("[ARQ:notif] send_welcome_operator operator=%s try=%d", operator_id, ctx["job_try"])
    session = _make_session()
    try:
        oid    = _uuid.UUID(operator_id)
        result = await session.execute(select(Operator).where(Operator.id == oid))
        operator = result.scalar_one_or_none()
        if operator is None:
            log.warning("[ARQ:notif] Operator %s not found", operator_id)
            return
        await send_welcome_operator(session, operator)
    except Exception as exc:
        log.exception("[ARQ:notif] send_welcome_operator FAILED operator=%s: %s", operator_id, exc)
        _maybe_retry(ctx, exc)
    finally:
        await session.close()


async def send_first_booking_alert_task(
    ctx: dict,
    *,
    operator_id: str,
    booking_id: str,
) -> None:
    """Alert the operator when their first booking is received."""
    import uuid as _uuid
    from sqlalchemy import select
    from app.models.operator import Operator
    from app.services.notification_service import send_first_booking_alert

    log.info(
        "[ARQ:notif] send_first_booking_alert operator=%s booking=%s try=%d",
        operator_id, booking_id, ctx["job_try"],
    )
    session = _make_session()
    try:
        oid     = _uuid.UUID(operator_id)
        result  = await session.execute(select(Operator).where(Operator.id == oid))
        operator = result.scalar_one_or_none()
        if operator is None:
            log.warning("[ARQ:notif] Operator %s not found", operator_id)
            return

        result2 = await session.execute(_booking_query(_uuid.UUID(booking_id)))
        booking  = result2.scalar_one_or_none()
        if booking is None:
            log.warning("[ARQ:notif] Booking %s not found", booking_id)
            return

        await send_first_booking_alert(session, operator, booking)
    except Exception as exc:
        log.exception(
            "[ARQ:notif] send_first_booking_alert FAILED operator=%s booking=%s: %s",
            operator_id, booking_id, exc,
        )
        _maybe_retry(ctx, exc)
    finally:
        await session.close()


# ── Retry helper ──────────────────────────────────────────────────────────────

def _maybe_retry(ctx: dict, exc: Exception) -> None:
    """Re-raise as ARQ Retry if we haven't exhausted max attempts."""
    from arq import Retry

    attempt = ctx.get("job_try", 1)
    if attempt < _MAX_TRIES:
        log.info("[ARQ] Scheduling retry attempt %d/%d in %ds", attempt + 1, _MAX_TRIES, _RETRY_DEFER)
        raise Retry(defer=_RETRY_DEFER)
    log.error("[ARQ] Giving up after %d attempts", attempt)


# ── Worker settings (main worker) ─────────────────────────────────────────────

class WorkerSettings:
    """
    Main ARQ worker — handles label generation + all notification tasks.
    Start with: arq app.workers.tasks.WorkerSettings
    """

    functions = [
        # Labels
        generate_qr_label_task,
        # Notifications
        send_booking_confirmed_task,
        send_item_received_task,
        send_trip_departed_task,
        send_arrival_blast_task,
        send_collected_task,
        send_delivered_task,
        send_welcome_operator_task,
        send_first_booking_alert_task,
    ]

    @property
    def redis_settings(self) -> RedisSettings:
        from app.core.config import settings as app_settings

        parsed = urlparse(app_settings.REDIS_URL)
        return RedisSettings(
            host=parsed.hostname or "localhost",
            port=parsed.port or 6379,
            password=parsed.password,
            database=int(parsed.path.lstrip("/") or 0),
        )

    max_jobs    = 10
    job_timeout = 300           # 5 minutes per job (label gen + bulk fan-outs)
    keep_result = 3600          # keep job results for 1 hour
