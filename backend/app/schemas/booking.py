"""
Pydantic schemas for the Bookings API (Part 5).

Public creation, operator management, weigh-in, scan, and tracking views.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.booking import BookingStatus, CollectionType, PaymentStatus


# ── Request bodies ────────────────────────────────────────────────────────────

class BookingCreate(BaseModel):
    """Posted by a sender via the public booking form."""
    trip_id: uuid.UUID

    # Sender
    sender_name:  str           = Field(..., min_length=1, max_length=255)
    sender_phone: str           = Field(..., min_length=5, max_length=50)
    sender_email: str | None    = Field(None, max_length=255)

    # Recipient
    recipient_name:  str        = Field(..., min_length=1, max_length=255)
    recipient_phone: str | None = Field(None, max_length=50)
    recipient_city:  str        = Field(..., min_length=1, max_length=100)

    # Item
    item_description:  str   = Field(..., min_length=1, max_length=500)
    quantity:          int   = Field(1, ge=1, le=999)
    estimated_weight_kg: Decimal = Field(Decimal("0"), ge=Decimal("0"), le=Decimal("9999"))

    @model_validator(mode="after")
    def _names_not_same(self) -> "BookingCreate":
        if self.sender_name.strip().lower() == self.recipient_name.strip().lower():
            from app.core.errors import validation_error
            raise validation_error("Sender and recipient cannot be the same person")
        return self


class WeighInRequest(BaseModel):
    """Operator records the actual weight at drop-off."""
    confirmed_weight_kg: Decimal = Field(..., gt=Decimal("0"), le=Decimal("9999"))
    payment_status: PaymentStatus | None = None


class ScanRequest(BaseModel):
    """Operator scans a QR label to record a checkpoint."""
    note: str | None = Field(None, max_length=255)


class StatusUpdate(BaseModel):
    """Operator manually moves a booking to a new status."""
    status:          BookingStatus
    collection_type: CollectionType | None = None

    @model_validator(mode="after")
    def _collection_required_for_ready(self) -> "StatusUpdate":
        if self.status == BookingStatus.ready and self.collection_type is None:
            from app.core.errors import validation_error
            raise validation_error("collection_type is required when setting status to 'ready'")
        return self


# ── Response schemas ──────────────────────────────────────────────────────────

class BookingResponse(BaseModel):
    """Full detail response for the operator."""
    model_config = ConfigDict(from_attributes=True)

    id:               uuid.UUID
    trip_id:          uuid.UUID
    operator_id:      uuid.UUID
    reference_number: str

    sender_name:  str
    sender_phone: str
    sender_email: str | None

    recipient_name:  str
    recipient_phone: str | None
    recipient_city:  str

    item_description: str
    quantity:         int
    estimated_weight_kg:  Decimal
    confirmed_weight_kg:  Decimal | None

    # Human-readable cost strings (e.g. "USD 28.50")
    estimated_cost_display: str | None
    confirmed_cost_display:  str | None

    currency:       str
    status:         str
    collection_type: str | None
    payment_status:  str

    qr_label_generated:    bool
    qr_label_generated_at: datetime | None
    qr_label_url:          str | None

    last_scanned_at: datetime | None
    scan_count:      int

    created_at: datetime
    updated_at: datetime

    # Denormalised trip info for convenience
    trip_public_slug:    str | None = None
    trip_departure_date: date | None = None
    trip_direction:      str | None = None


class BookingPublicResponse(BaseModel):
    """Returned to the sender immediately after booking creation."""
    id:               uuid.UUID
    reference_number: str
    trip_id:          uuid.UUID
    status:           str
    estimated_cost_display: str | None
    currency:         str

    sender_name:  str
    recipient_name: str
    recipient_city: str
    item_description: str
    estimated_weight_kg: Decimal


# ── Tracking (public, sender-facing) ─────────────────────────────────────────

class StatusEvent(BaseModel):
    """A single status-change event shown in the tracking timeline."""
    status:     str
    label:      str       # human-readable e.g. "Parcel received"
    occurred_at: datetime | None  # None = not yet reached


class TripForTracking(BaseModel):
    direction:      str
    origin_city:    str
    destination_city: str
    departure_date: date
    status:         str


class BookingTrackingResponse(BaseModel):
    """Public tracking payload — no sensitive contact info."""
    reference_number:  str
    sender_first_name: str        # only first name
    recipient_city:    str
    item_description:  str
    status:            str
    status_label:      str        # e.g. "In Transit"
    collection_type:   str | None
    pickup_location:   str | None   # from trip when arrived
    pickup_window:     str | None
    trip:              TripForTracking
    timeline:          list[StatusEvent]
    last_scanned_at:   datetime | None
