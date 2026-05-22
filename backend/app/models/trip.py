import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ── Enums ─────────────────────────────────────────────────────────────────────

class TripDirection(str, enum.Enum):
    outbound = "outbound"   # US / UK → Gambia
    inbound  = "inbound"    # Gambia → US / UK


class TripStatus(str, enum.Enum):
    draft      = "draft"
    open       = "open"
    closed     = "closed"
    in_transit = "in_transit"
    arrived    = "arrived"
    completed  = "completed"


class PricingModel(str, enum.Enum):
    per_kg    = "per_kg"
    per_item  = "per_item"
    flat      = "flat"


# ── Model ─────────────────────────────────────────────────────────────────────

class Trip(Base):
    # PK
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Owner
    operator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("operators.id", ondelete="CASCADE"), nullable=False
    )

    # Route
    direction:           Mapped[TripDirection] = mapped_column(
        SAEnum(TripDirection, name="trip_direction", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    origin_city:         Mapped[str]  = mapped_column(String(100), nullable=False)
    origin_country:      Mapped[str]  = mapped_column(String(2),   nullable=False)  # ISO 3166-1 alpha-2
    destination_city:    Mapped[str]  = mapped_column(String(100), nullable=False)
    destination_country: Mapped[str]  = mapped_column(String(2),   nullable=False)

    # Schedule
    departure_date: Mapped[date] = mapped_column(Date, nullable=False)
    cutoff_date:    Mapped[date] = mapped_column(Date, nullable=False)

    # Status & pricing
    status: Mapped[TripStatus] = mapped_column(
        SAEnum(TripStatus, name="trip_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=TripStatus.draft,
        server_default=TripStatus.draft.value,
    )
    pricing_model: Mapped[PricingModel] = mapped_column(
        SAEnum(PricingModel, name="pricing_model", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    # Rate always stored in kg regardless of operator's display unit preference
    rate_per_kg: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    currency:    Mapped[str]     = mapped_column(String(3), nullable=False)  # ISO 4217

    # Capacity
    capacity_kg: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))

    # Content rules
    accepted_item_types: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="'[]'::jsonb"
    )
    customs_advisory: Mapped[str | None] = mapped_column(Text)

    # Public identity
    public_slug: Mapped[str]  = mapped_column(String(120), unique=True, nullable=False)
    view_count:  Mapped[int]  = mapped_column(Integer, nullable=False, default=0, server_default="0")

    # Pickup info — populated when operator marks trip as arrived
    pickup_location:     Mapped[str | None]      = mapped_column(String(255))
    pickup_window:       Mapped[str | None]      = mapped_column(String(100))
    pickup_notes:        Mapped[str | None]      = mapped_column(Text)
    arrived_at:          Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    arrival_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # ── Relationships ──────────────────────────────────────────────────────
    operator:          Mapped["Operator"]               = relationship("Operator",            back_populates="trips")
    bookings:          Mapped[list["Booking"]]          = relationship("Booking",             back_populates="trip")
    updates:           Mapped[list["TripUpdate"]]       = relationship("TripUpdate",          back_populates="trip")
    drop_off_locations: Mapped[list["TripDropoffLocation"]] = relationship(
        "TripDropoffLocation",
        back_populates="trip",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<Trip id={self.id} slug={self.public_slug!r} "
            f"status={self.status.value} direction={self.direction.value}>"
        )


# ── Drop-off location ─────────────────────────────────────────────────────────

class TripDropoffLocation(Base):
    __tablename__ = "trip_dropoff_locations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    label:         Mapped[str]      = mapped_column(String(200), nullable=False)
    address:       Mapped[str | None] = mapped_column(String(500))
    city:          Mapped[str | None] = mapped_column(String(100))
    state:         Mapped[str | None] = mapped_column(String(100))
    display_order: Mapped[int]      = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at:    Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    trip: Mapped["Trip"] = relationship("Trip", back_populates="drop_off_locations")

    def __repr__(self) -> str:
        return f"<TripDropoffLocation trip_id={self.trip_id} label={self.label!r}>"
