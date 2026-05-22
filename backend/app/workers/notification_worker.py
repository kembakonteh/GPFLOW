"""
Dedicated ARQ worker for WhatsApp notifications (Part 6).

Run alongside the main worker for higher notification throughput:
    arq app.workers.notification_worker.WorkerSettings

This worker is optimised for fast, short-lived notification jobs
(job_timeout=30s, max_jobs=20) while the main worker handles heavier
tasks like PDF generation (job_timeout=300s, max_jobs=10).

Both workers share the same Redis queue — any worker picks up any job
it has registered. Running both gives you parallelism:
  - Notification jobs are handled quickly by this worker
  - Label/batch jobs are handled by the main worker without blocking notifications
"""

from __future__ import annotations

from urllib.parse import urlparse

from arq.connections import RedisSettings

from app.workers.tasks import (
    send_arrival_blast_task,
    send_booking_confirmed_task,
    send_collected_task,
    send_delivered_task,
    send_first_booking_alert_task,
    send_item_received_task,
    send_trip_departed_task,
    send_welcome_operator_task,
)


def _build_redis_settings() -> RedisSettings:
    from app.core.config import settings as app_settings

    parsed = urlparse(app_settings.REDIS_URL)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        password=parsed.password,
        database=int(parsed.path.lstrip("/") or 0),
    )


class WorkerSettings:
    """
    Notification-only ARQ worker.
    Start with: arq app.workers.notification_worker.WorkerSettings
    """

    functions = [
        send_booking_confirmed_task,
        send_item_received_task,
        send_trip_departed_task,
        send_arrival_blast_task,
        send_collected_task,
        send_delivered_task,
        send_welcome_operator_task,
        send_first_booking_alert_task,
    ]

    redis_settings = _build_redis_settings()

    max_jobs    = 20
    job_timeout = 30       # notifications should complete in < 10 s
    keep_result = 3600
