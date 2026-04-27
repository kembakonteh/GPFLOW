"""
WhatsApp Cloud API notification service (Part 6).

All public functions accept fully-loaded ORM objects (relations pre-fetched)
and return a bool — True on successful API delivery, False on any error.
Errors are always logged to the notification_logs table and to the app logger;
they are NEVER re-raised so that notification failures cannot break the main flow.

API reference:
  POST https://graph.facebook.com/v19.0/{PHONE_ID}/messages
  Headers: Authorization: Bearer <token>, Content-Type: application/json
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking, CollectionType
from app.models.notification_log import NotificationLog
from app.models.operator import Operator
from app.models.trip import Trip, TripDirection

log = logging.getLogger(__name__)

BASE_URL = "https://graph.facebook.com/v19.0"

# ── Currency symbol map ───────────────────────────────────────────────────────

_CURRENCY_SYMBOLS: dict[str, str] = {
    "USD": "$",
    "GBP": "£",
    "EUR": "€",
    "GMD": "D",
    "CAD": "CA$",
    "SEK": "kr",
}

# ── Country → flag + display name ─────────────────────────────────────────────

_COUNTRY_DISPLAY: dict[str, tuple[str, str]] = {
    "US": ("🇺🇸", "United States"),
    "GB": ("🇬🇧", "United Kingdom"),
    "GM": ("🇬🇲", "The Gambia"),
    "GN": ("🇬🇳", "Guinea"),
    "SN": ("🇸🇳", "Senegal"),
    "CA": ("🇨🇦", "Canada"),
    "SE": ("🇸🇪", "Sweden"),
    "DE": ("🇩🇪", "Germany"),
    "FR": ("🇫🇷", "France"),
    "ES": ("🇪🇸", "Spain"),
    "IT": ("🇮🇹", "Italy"),
    "NL": ("🇳🇱", "Netherlands"),
    "BE": ("🇧🇪", "Belgium"),
    "NO": ("🇳🇴", "Norway"),
    "DK": ("🇩🇰", "Denmark"),
    "FI": ("🇫🇮", "Finland"),
}


# ── Phone formatting ──────────────────────────────────────────────────────────

def format_phone_for_whatsapp(phone: str) -> str:
    """
    Strip all non-digit characters so the phone is WhatsApp-API safe.
    Handles both "+" international prefix and "00" IDD exit-code prefix.

    Examples:
        "+1 206 555 0142"  → "12065550142"
        "+44 7911 123456"  → "447911123456"
        "001-206-555-0142" → "12065550142"
    """
    digits = re.sub(r"\D", "", phone)
    # "00" IDD prefix → strip the leading zeros (e.g. "001..." → "1...")
    if digits.startswith("00"):
        digits = digits[2:]
    return digits


# ── Display helpers ───────────────────────────────────────────────────────────

def _first_name(full_name: str) -> str:
    return (full_name or "").split()[0] if full_name else "there"


def _currency_symbol(currency: str) -> str:
    return _CURRENCY_SYMBOLS.get(currency.upper(), currency + " ")


def _format_cost(minor: int | None, currency: str) -> str:
    """Return e.g. '$28.50' or 'USD 28.50' as fallback."""
    if minor is None:
        return "TBD"
    sym = _currency_symbol(currency)
    return f"{sym}{minor / 100:.2f}"


def _format_weight_display(weight_kg: float, operator: Operator) -> str:
    """
    Return weight in operator's preferred unit with kg shown in parens.
    e.g. "4.2 lbs (1.9 kg)" or "1.9 kg"
    """
    from app.models.operator import WeightUnit
    from app.utils.units import kg_to_lbs

    if operator.weight_unit == WeightUnit.lbs:
        lbs = kg_to_lbs(weight_kg)
        return f"{lbs:.1f} lbs ({weight_kg:.1f} kg)"
    return f"{weight_kg:.2f} kg"


def _format_date(d: date) -> str:
    """Return e.g. 'Mon 21 Apr 2026'."""
    return d.strftime("%a %d %b %Y")


def _direction_aware_destination(trip: Trip) -> str:
    """
    Build a human-readable destination for arrived notifications.
    Outbound: uses destination_city + flag for Gambia (or any destination).
    Inbound:  same — destination_city + destination_country + flag.
    """
    city    = trip.destination_city
    country = trip.destination_country.upper()
    flag, _ = _COUNTRY_DISPLAY.get(country, ("", country))
    return f"{city}, {_COUNTRY_DISPLAY.get(country, ('', country))[1] or country} {flag}".strip()


# ── Core send function ────────────────────────────────────────────────────────

async def send_template_message(
    db:             AsyncSession,
    phone:          str,
    template_name:  str,
    variables:      list[str],
    operator_id:    uuid.UUID,
    booking_id:     uuid.UUID | None = None,
    trip_id:        uuid.UUID | None = None,
    recipient_type: str = "sender",
) -> bool:
    """
    POST a WhatsApp template message to a single recipient.

    On success: persists a NotificationLog with status "sent".
    On failure: persists a NotificationLog with status "failed" + error detail.
    Never raises — always returns True/False.
    """
    from app.core.config import settings

    wa_phone = format_phone_for_whatsapp(phone)
    if not wa_phone:
        log.warning("[WA] Skipping send — blank phone after formatting (raw=%r)", phone)
        return False

    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": wa_phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": "en_US"},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": str(var)}
                        for var in variables
                    ],
                }
            ],
        },
    }

    url     = f"{BASE_URL}/{settings.WHATSAPP_PHONE_ID}/messages"
    headers = {
        "Authorization": f"Bearer {settings.WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }

    wa_message_id: str | None = None
    status        = "failed"
    error_message: str | None = None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=payload)

        if resp.status_code == 200:
            body          = resp.json()
            wa_message_id = body.get("messages", [{}])[0].get("id")
            status        = "sent"
            log.info(
                "[WA] Sent template=%r to=%r wa_id=%r booking=%s",
                template_name, wa_phone, wa_message_id, booking_id,
            )
        else:
            error_message = f"HTTP {resp.status_code}: {resp.text[:400]}"
            log.error(
                "[WA] API error template=%r to=%r: %s",
                template_name, wa_phone, error_message,
            )

    except Exception as exc:
        error_message = f"{type(exc).__name__}: {exc}"
        log.exception(
            "[WA] Request failed template=%r to=%r: %s",
            template_name, wa_phone, exc,
        )

    # ── Persist notification log ───────────────────────────────────────────
    try:
        log_entry = NotificationLog(
            booking_id=booking_id,
            trip_id=trip_id,
            operator_id=operator_id,
            recipient_type=recipient_type,
            phone_number=wa_phone,
            template_name=template_name,
            message_body=json.dumps(
                {"template": template_name, "variables": variables},
                ensure_ascii=False,
            ),
            channel="whatsapp",
            status=status,
            whatsapp_message_id=wa_message_id,
            error_message=error_message,
        )
        db.add(log_entry)
        await db.commit()
    except Exception as db_exc:
        log.exception("[WA] Failed to persist NotificationLog: %s", db_exc)

    return status == "sent"


# ── Template functions ────────────────────────────────────────────────────────

async def send_booking_confirmed(db: AsyncSession, booking: Booking) -> bool:
    """
    Sent to the sender immediately after booking creation.
    Template: gpflow_booking_confirmed (9 variables)
    """
    from app.core.config import settings

    trip     = booking.trip
    operator = booking.operator
    est_cost = _format_cost(booking.estimated_cost_minor, booking.currency)
    tracking = f"gpflow.app/track/{booking.reference_number}"

    variables = [
        _first_name(booking.sender_name),          # 1. sender first name
        operator.business_name,                     # 2. operator business name
        booking.reference_number,                   # 3. reference
        booking.item_description,                   # 4. item description
        booking.recipient_name,                     # 5. recipient name
        booking.recipient_city,                     # 6. recipient city
        _format_date(trip.departure_date),          # 7. departure date
        est_cost,                                   # 8. estimated cost
        tracking,                                   # 9. tracking URL
    ]

    return await send_template_message(
        db=db,
        phone=booking.sender_phone,
        template_name="gpflow_booking_confirmed",
        variables=variables,
        operator_id=booking.operator_id,
        booking_id=booking.id,
        trip_id=booking.trip_id,
        recipient_type="sender",
    )


async def send_item_received(db: AsyncSession, booking: Booking) -> bool:
    """
    Sent to the sender after weigh-in.
    Template: gpflow_item_received (8 variables)
    Confirmed values are always present at this point.
    """
    trip     = booking.trip
    operator = booking.operator

    weight_kg = float(booking.confirmed_weight_kg or booking.estimated_weight_kg)
    cost_minor = booking.confirmed_cost_minor or booking.estimated_cost_minor

    weight_display = _format_weight_display(weight_kg, operator)
    cost_display   = _format_cost(cost_minor, booking.currency)
    tracking       = f"gpflow.app/track/{booking.reference_number}"

    variables = [
        _first_name(booking.sender_name),           # 1. sender first name
        booking.reference_number,                   # 2. reference
        booking.item_description,                   # 3. item description
        weight_display,                             # 4. confirmed weight e.g. "4.2 lbs (1.9 kg)"
        cost_display,                               # 5. confirmed cost e.g. "$15.18"
        _format_date(trip.departure_date),          # 6. departure date
        "QR label printed and attached",            # 7. label status
        tracking,                                   # 8. tracking URL
    ]

    return await send_template_message(
        db=db,
        phone=booking.sender_phone,
        template_name="gpflow_item_received",
        variables=variables,
        operator_id=booking.operator_id,
        booking_id=booking.id,
        trip_id=booking.trip_id,
        recipient_type="sender",
    )


async def send_trip_departed(db: AsyncSession, booking: Booking) -> bool:
    """
    Sent to each sender when the operator marks a trip as in_transit.
    Template: gpflow_trip_departed (8 variables)
    """
    trip     = booking.trip
    operator = booking.operator

    destination = _direction_aware_destination(trip)
    # ETA = departure date + 1 day
    eta = _format_date(trip.departure_date + timedelta(days=1))
    tracking = f"gpflow.app/track/{booking.reference_number}"

    variables = [
        _first_name(booking.sender_name),           # 1. sender first name
        operator.business_name,                     # 2. operator business name
        booking.reference_number,                   # 3. reference
        booking.recipient_name,                     # 4. recipient name
        booking.recipient_city,                     # 5. recipient city
        destination,                                # 6. full destination
        eta,                                        # 7. ETA
        tracking,                                   # 8. tracking URL
    ]

    return await send_template_message(
        db=db,
        phone=booking.sender_phone,
        template_name="gpflow_trip_departed",
        variables=variables,
        operator_id=booking.operator_id,
        booking_id=booking.id,
        trip_id=booking.trip_id,
        recipient_type="sender",
    )


async def send_arrived_sender(db: AsyncSession, booking: Booking) -> bool:
    """
    Sent to each sender when the trip arrives.
    Template: gpflow_arrived_sender (9 variables)
    """
    trip     = booking.trip
    operator = booking.operator
    tracking = f"gpflow.app/track/{booking.reference_number}"

    destination = _direction_aware_destination(trip)

    pickup_location = trip.pickup_location or "To be confirmed"
    pickup_window   = trip.pickup_window   or "To be confirmed"

    # Collection instruction depends on how operator flagged the booking
    if booking.collection_type == CollectionType.operator_delivers:
        collection_instruction = "We will deliver directly to your recipient"
    else:
        # Default / self_collect
        collection_instruction = "Please bring your reference number to collect"

    variables = [
        _first_name(booking.sender_name),           # 1. sender first name
        operator.business_name,                     # 2. operator business name
        booking.reference_number,                   # 3. reference
        booking.item_description,                   # 4. item description
        destination,                                # 5. destination (direction-aware)
        pickup_location,                            # 6. pickup location
        pickup_window,                              # 7. pickup window
        collection_instruction,                     # 8. collection instruction
        tracking,                                   # 9. tracking URL
    ]

    return await send_template_message(
        db=db,
        phone=booking.sender_phone,
        template_name="gpflow_arrived_sender",
        variables=variables,
        operator_id=booking.operator_id,
        booking_id=booking.id,
        trip_id=booking.trip_id,
        recipient_type="sender",
    )


async def send_collected(db: AsyncSession, booking: Booking) -> bool:
    """
    Sent to the sender when the parcel is collected.
    Template: gpflow_item_collected (6 variables)
    """
    operator = booking.operator
    tracking = f"gpflow.app/track/{booking.reference_number}"

    variables = [
        _first_name(booking.sender_name),           # 1. sender first name
        booking.recipient_name,                     # 2. recipient name
        booking.recipient_city,                     # 3. recipient city
        booking.reference_number,                   # 4. reference
        operator.business_name,                     # 5. operator business name
        tracking,                                   # 6. tracking URL
    ]

    return await send_template_message(
        db=db,
        phone=booking.sender_phone,
        template_name="gpflow_item_collected",
        variables=variables,
        operator_id=booking.operator_id,
        booking_id=booking.id,
        trip_id=booking.trip_id,
        recipient_type="sender",
    )


async def send_delivered(db: AsyncSession, booking: Booking) -> bool:
    """
    Sent to the sender when the parcel is delivered.
    Template: gpflow_item_delivered (6 variables)
    """
    operator = booking.operator

    variables = [
        _first_name(booking.sender_name),           # 1. sender first name
        booking.recipient_name,                     # 2. recipient name
        booking.recipient_city,                     # 3. recipient city
        booking.reference_number,                   # 4. reference
        booking.item_description,                   # 5. item description
        operator.business_name,                     # 6. operator business name
    ]

    return await send_template_message(
        db=db,
        phone=booking.sender_phone,
        template_name="gpflow_item_delivered",
        variables=variables,
        operator_id=booking.operator_id,
        booking_id=booking.id,
        trip_id=booking.trip_id,
        recipient_type="sender",
    )


async def send_welcome_operator(db: AsyncSession, operator: Operator) -> bool:
    """
    Sent to the operator immediately after registration.
    Template: gpflow_welcome_operator (2 variables)
    """
    from app.core.config import settings

    onboarding_url = f"{str(settings.FRONTEND_URL).rstrip('/')}/onboarding"

    variables = [
        _first_name(operator.name),                 # 1. operator first name
        onboarding_url,                             # 2. onboarding URL
    ]

    return await send_template_message(
        db=db,
        phone=operator.phone,
        template_name="gpflow_welcome_operator",
        variables=variables,
        operator_id=operator.id,
        booking_id=None,
        trip_id=None,
        recipient_type="operator",
    )


async def send_first_booking_alert(
    db: AsyncSession,
    operator: Operator,
    booking: Booking,
) -> bool:
    """
    Alert the operator when their first booking is received.
    Template: gpflow_first_booking_alert (4 variables)
    """
    trip = booking.trip

    variables = [
        _first_name(operator.name),                 # 1. operator first name
        booking.sender_name,                        # 2. sender name
        booking.reference_number,                   # 3. reference
        _format_date(trip.departure_date),          # 4. trip departure date
    ]

    return await send_template_message(
        db=db,
        phone=operator.phone,
        template_name="gpflow_first_booking_alert",
        variables=variables,
        operator_id=operator.id,
        booking_id=booking.id,
        trip_id=booking.trip_id,
        recipient_type="operator",
    )
