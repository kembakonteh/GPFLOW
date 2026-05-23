import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.models.booking import CollectionType
from app.models.trip import PricingModel, TripDirection, TripStatus


# ── Drop-off location schemas ─────────────────────────────────────────────────

class DropoffLocationCreate(BaseModel):
    label:         str            = Field(..., min_length=1)
    address:       str | None     = None
    city:          str | None     = None
    state:         str | None     = None
    display_order: int            = 0


class DropoffLocationResponse(BaseModel):
    id:            uuid.UUID
    label:         str
    address:       str | None
    city:          str | None
    state:         str | None
    display_order: int


# ── Create / Update ───────────────────────────────────────────────────────────

class TripCreate(BaseModel):
    direction:           TripDirection
    origin_city:         str            = Field(..., min_length=1)
    origin_country:      str            = Field(..., min_length=2, max_length=2)
    destination_city:    str            = Field(..., min_length=1)
    destination_country: str            = Field(..., min_length=2, max_length=2)
    departure_date:      date
    cutoff_date:         date
    pricing_model:       PricingModel
    # Sent in the operator's preferred unit; service converts to kg before storing
    rate_per_kg:         Decimal        = Field(..., gt=0, description="Rate in operator's display unit — converted to kg/unit server-side")
    currency:            str            = Field("USD", min_length=3, max_length=3)
    capacity_kg:         Decimal | None = Field(None, gt=0)
    accepted_item_types:  list[str]                = []
    customs_advisory:     str | None               = None
    domestic_mailing_fee: Decimal | None           = None
    drop_off_locations:   list[DropoffLocationCreate] = []

    @model_validator(mode="after")
    def validate_trip(self) -> "TripCreate":
        today = date.today()
        if self.departure_date <= today:
            raise ValueError("departure_date must be in the future")
        if self.cutoff_date >= self.departure_date:
            raise ValueError("cutoff_date must be before departure_date")
        if (
            self.origin_country.upper() == self.destination_country.upper()
            and self.origin_city.strip().lower() == self.destination_city.strip().lower()
        ):
            raise ValueError("Origin and destination must differ")
        return self


class TripUpdate(BaseModel):
    """All fields optional — supports wizard progressive saves."""
    direction:           TripDirection | None = None
    origin_city:         str | None           = None
    origin_country:      str | None           = Field(None, min_length=2, max_length=2)
    destination_city:    str | None           = None
    destination_country: str | None           = Field(None, min_length=2, max_length=2)
    departure_date:      date | None          = None
    cutoff_date:         date | None          = None
    pricing_model:       PricingModel | None  = None
    rate_per_kg:         Decimal | None       = Field(None, gt=0)
    currency:            str | None           = Field(None, min_length=3, max_length=3)
    capacity_kg:         Decimal | None       = None   # None means "clear"
    accepted_item_types:  list[str] | None                = None
    customs_advisory:     str | None                      = None
    domestic_mailing_fee: Decimal | None                  = None
    status:               TripStatus | None               = None
    drop_off_locations:   list[DropoffLocationCreate] | None = None


# ── Arrival ───────────────────────────────────────────────────────────────────

class CollectionAssignment(BaseModel):
    booking_id:      uuid.UUID
    collection_type: CollectionType


class ArrivalRequest(BaseModel):
    pickup_location:        str
    pickup_window:          str   = Field(..., description="e.g. 'May 7 – May 9 · 10am – 4pm daily'")
    pickup_notes:           str   = ""
    collection_assignments: list[CollectionAssignment] = []


# ── Response schemas ──────────────────────────────────────────────────────────

class TripResponse(BaseModel):
    """Full trip detail — returned to authenticated operators."""
    id:                  uuid.UUID
    operator_id:         uuid.UUID
    direction:           str
    direction_badge:     str
    origin_city:         str
    origin_country:      str
    destination_city:    str
    destination_country: str
    departure_date:      date
    cutoff_date:         date
    status:              str
    pricing_model:       str
    rate_per_kg:         Decimal
    currency:            str
    capacity_kg:          Decimal | None
    accepted_item_types:  list
    customs_advisory:     str | None
    domestic_mailing_fee: Decimal | None
    public_slug:          str
    view_count:           int
    pickup_location:     str | None
    pickup_window:       str | None
    pickup_notes:        str | None
    arrived_at:          datetime | None
    arrival_notified_at: datetime | None
    created_at:          datetime
    updated_at:          datetime
    # Denormalised operator fields
    operator_name:          str
    operator_business_name: str
    # Populated only for single-trip fetches
    booking_counts:    dict | None                   = None
    drop_off_locations: list[DropoffLocationResponse] = []


class PublicTripResponse(BaseModel):
    """Customer-facing trip page — no sensitive operator data."""
    id:                  uuid.UUID
    direction:           str
    direction_badge:     str
    origin_city:         str
    origin_country:      str
    destination_city:    str
    destination_country: str
    departure_date:      date
    cutoff_date:         date
    status:              str
    pricing_model:       str
    rate_display:        str      # e.g. "$3.62/lb" or "$8.00/kg"
    currency:            str
    capacity_kg:          Decimal | None
    spots_remaining:      int | None   # None when capacity not set
    accepted_item_types:  list
    customs_advisory:     str | None
    domestic_mailing_fee: Decimal | None = None
    public_slug:          str
    view_count:          int
    pickup_location:     str | None
    pickup_window:       str | None
    pickup_notes:        str | None
    arrived_at:          datetime | None
    operator_name:          str
    operator_business_name: str
    operator_phone:         str
    # Operator mailing address — shown on public trip page so customers can mail packages
    operator_mailing_address_line1: str | None = None
    operator_mailing_address_line2: str | None = None
    operator_mailing_city:          str | None = None
    operator_mailing_state:         str | None = None
    operator_mailing_zip:           str | None = None
    operator_mailing_country:       str | None = None
    operator_mailing_instructions:  str | None = None
    drop_off_locations:     list[DropoffLocationResponse] = []


# ── Notify-arrival response ───────────────────────────────────────────────────

class NotifyArrivalResponse(BaseModel):
    notified: int
    failed:   int


# ── Trip announcement ─────────────────────────────────────────────────────────

class TripAnnouncementResponse(BaseModel):
    whatsapp_message: str
    public_url:       str
