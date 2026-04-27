"""
WhatsApp Cloud API webhook handler (Part 6).

Meta sends two kinds of requests to this endpoint:
  GET  — hub verification (one-time setup)
  POST — delivery/read status updates and inbound messages

Verification flow:
  Meta sends ?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=NONCE
  We check the token, then echo back hub.challenge as plain text.

Status update flow:
  Meta POSTs a JSON envelope with a statuses array.
  We look up each status by whatsapp_message_id and update the log.
  Always return 200 immediately — heavy work goes to a background task.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.errors import forbidden
from app.models.notification_log import NotificationLog

log = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _verify_token() -> str:
    """
    The token we registered in Meta's webhook dashboard.
    We reuse SECRET_KEY so there's no extra env var to manage.
    Store a distinct value here when you have a proper WHATSAPP_VERIFY_TOKEN.
    """
    from app.core.config import settings
    return settings.SECRET_KEY


# ── GET /webhooks/whatsapp — hub verification ─────────────────────────────────

@router.get("/whatsapp", response_class=PlainTextResponse)
async def verify_webhook(
    hub_mode:         str | None = Query(None, alias="hub.mode"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
    hub_challenge:    str | None = Query(None, alias="hub.challenge"),
) -> str:
    """
    Meta calls this endpoint once to verify our webhook URL is real.
    Respond with the challenge string — anything else causes verification to fail.
    """
    if hub_mode != "subscribe":
        log.warning("[Webhook] Unexpected hub.mode=%r", hub_mode)
        raise forbidden()

    if hub_verify_token != _verify_token():
        log.warning("[Webhook] Token mismatch — possible spoofed verification request")
        raise forbidden()

    log.info("[Webhook] WhatsApp webhook verified successfully")
    return hub_challenge or ""


# ── POST /webhooks/whatsapp — incoming events ─────────────────────────────────

@router.post("/whatsapp", status_code=200)
async def receive_webhook(
    request: Request,
    db:      AsyncSession = Depends(get_db),
) -> dict:
    """
    Receive status updates (sent → delivered → read) and inbound messages.

    Meta expects a 200 within 20 s — we do minimal synchronous work and
    return immediately. Heavy fan-out is already handled by ARQ workers.

    Payload shape (delivery receipts):
    {
      "object": "whatsapp_business_account",
      "entry": [{
        "changes": [{
          "value": {
            "statuses": [{
              "id": "wamid.xxx",
              "status": "delivered",   // sent | delivered | read | failed
              "timestamp": "...",
              "recipient_id": "..."
            }]
          }
        }]
      }]
    }
    """
    try:
        body = await request.json()
    except Exception:
        # Malformed body — ack anyway so Meta stops retrying
        log.warning("[Webhook] Could not parse webhook body")
        return {"status": "ok"}

    if body.get("object") != "whatsapp_business_account":
        return {"status": "ok"}

    # Iterate over all status entries in the nested structure
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            value    = change.get("value", {})
            statuses = value.get("statuses", [])
            for status_event in statuses:
                await _process_status_event(db, status_event)

    return {"status": "ok"}


async def _process_status_event(db: AsyncSession, event: dict) -> None:
    """
    Update a NotificationLog row when Meta confirms delivery or reports failure.
    """
    wa_id      = event.get("id")
    new_status = event.get("status")   # "sent" | "delivered" | "read" | "failed"
    timestamp  = event.get("timestamp")

    if not wa_id or not new_status:
        return

    # Map Meta's status vocabulary to our internal statuses
    if new_status in ("delivered", "read"):
        internal_status = "delivered"
    elif new_status == "failed":
        internal_status = "failed"
    else:
        # "sent" means Meta accepted it — we already have "sent" from the API call
        return

    try:
        # Find the log entry by WhatsApp message ID
        result = await db.execute(
            select(NotificationLog).where(
                NotificationLog.whatsapp_message_id == wa_id
            )
        )
        log_entry = result.scalar_one_or_none()

        if log_entry is None:
            log.debug("[Webhook] No log entry found for wa_id=%r", wa_id)
            return

        updates: dict = {"status": internal_status}
        if internal_status == "delivered":
            from datetime import UTC, datetime
            updates["delivered_at"] = datetime.now(UTC)

        if new_status == "failed":
            errors = event.get("errors", [])
            if errors:
                msg = errors[0].get("title") or errors[0].get("message") or "Unknown failure"
                updates["error_message"] = str(msg)[:500]

        await db.execute(
            update(NotificationLog)
            .where(NotificationLog.id == log_entry.id)
            .values(**updates)
        )
        await db.commit()

        log.info(
            "[Webhook] Updated log %s → %s (wa_id=%r)",
            log_entry.id, internal_status, wa_id,
        )

    except Exception as exc:
        log.exception("[Webhook] Failed to update status for wa_id=%r: %s", wa_id, exc)
