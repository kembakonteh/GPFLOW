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

from app.models.booking import BookingStatus, CollectionType, PackageScanStatus, PaymentStatus


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
    item_description:    str     = Field(..., min_length=1, max_length=500)
    quantity:            int     = Field(1, ge=1, le=999)
    estimated_weight_kg: Decimal = Field(Decimal("0"), ge=Decimal("0"), le=Decimal("9999"))
    package_count:       int     = Field(1, ge=1, le=20)

    # Customer's preferred collection method — operator can override at arrival
    collection_type: CollectionType | None = None

    # Mailing fee — auto-computed from trip.domestic_mailing_fee when operator_delivers
    mailing_fee_charged: Decimal | None = None

    # Delivery address — optional, for operator_delivers bookings
    delivery_address_line1: str | None = Field(None, max_length=255)
    delivery_address_line2: str | None = Field(None, max_length=255)
    delivery_city:          str | None = Field(None, max_length=100)
    delivery_state:         str | None = Field(None, max_length=100)
    delivery_zip:           str | None = Field(None, max_length=20)
    delivery_country:       str | None = Field(None, max_length=2)
    delivery_notes:         str | None = Field(None, max_length=500)

    @model_validator(mode="after")
    def _names_not_same(self) -> "BookingCreate":
        if self.sender_name.strip().lower() == self.recipient_name.strip().lower():
            from app.core.errors import validation_error
            raise validation_error("Sender and recipient cannot be the same person")
        return self


class WeighInRequest(BaseModel):
    """Operator records the actual weight at drop-off."""
    confirmed_weight_kg: Decimal   = Field(..., gt=Decimal("0"), le=Decimal("9999"))
    payment_status:      PaymentStatus | None = None
    package_id:          uuid.UUID | None     = None


class PackageScanRequest(BaseModel):
    """Operator scans a package QR code to record receipt or delivery."""
    package_reference: str
    action:            str  # "received" | "delivered"


class PaymentUpdate(BaseModel):
    """Operator marks a booking as paid / unpaid / refunded."""
    payment_status: PaymentStatus


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

class PackageResponse(BaseModel):
    """Per-package detail included in BookingResponse."""
    model_config = ConfigDict(from_attributes=True)

    id:                uuid.UUID
    package_number:    int
    description:       str | None
    package_reference: str
    weight_kg:         Decimal | None
    qr_code:           str | None
    scan_status:       str
    scanned_at:        datetime | None


class PackagePublicResponse(BaseModel):
    """Minimal package info returned to the sender after booking."""
    package_number:    int
    package_reference: str
    description:       str | None


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
    package_count:    int
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

    # Delivery address
    delivery_address_line1: str | None
    delivery_address_line2: str | None
    delivery_city:          str | None
    delivery_state:         str | None
    delivery_zip:           str | None
    delivery_country:       str | None
    delivery_notes:         str | None
    mailing_fee_charged:    Decimal | None

    created_at: datetime
    updated_at: datetime

    # Denormalised trip info for convenience
    trip_public_slug:    str | None = None
    trip_departure_date: date | None = None
    trip_direction:      str | None = None

    # Per-package breakdown
    packages: list[PackageResponse] = []


class PackageScanResponse(BaseModel):
    """Returned after scanning a package QR code."""
    booking:               BookingResponse
    package:               PackageResponse
    booking_fully_updated: bool


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
    package_count:       int = 1
    packages:            list[PackagePublicResponse] = []

    # Delivery address — echoed back so confirmation page can display it
    delivery_address_line1: str | None = None
    delivery_address_line2: str | None = None
    delivery_city:          str | None = None
    delivery_state:         str | None = None
    delivery_zip:           str | None = None
    delivery_country:       str | None = None
    delivery_notes:         str | None = None
    mailing_fee_charged:    Decimal | None = None


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
