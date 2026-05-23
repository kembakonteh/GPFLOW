import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, Integer, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ── Enums ─────────────────────────────────────────────────────────────────────

class OperatorTier(str, enum.Enum):
    starter = "starter"
    regular = "regular"
    pro     = "pro"


class OperatorStatus(str, enum.Enum):
    onboarding = "onboarding"
    active     = "active"
    suspended  = "suspended"


class WeightUnit(str, enum.Enum):
    kg  = "kg"
    lbs = "lbs"


# ── Model ─────────────────────────────────────────────────────────────────────

_ONBOARDING_DEFAULT = text(
    """'{"profile_complete": false, "first_trip_created": false, """
    """"first_booking_received": false, "billing_setup": false}'::jsonb"""
)


class Operator(Base):
    # PK
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Identity
    name:          Mapped[str] = mapped_column(String(255), nullable=False)
    email:         Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    phone:         Mapped[str] = mapped_column(String(50),  unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    business_name: Mapped[str] = mapped_column(String(255), nullable=False)
    logo_url:      Mapped[str | None] = mapped_column(String(512))

    # Location
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    city:    Mapped[str] = mapped_column(String(100), nullable=False)

    # Mailing address — where out-of-area customers can mail packages to the operator
    mailing_address_line1: Mapped[str | None] = mapped_column(String(255))
    mailing_address_line2: Mapped[str | None] = mapped_column(String(255))
    mailing_city:          Mapped[str | None] = mapped_column(String(100))
    mailing_state:         Mapped[str | None] = mapped_column(String(100))
    mailing_zip:           Mapped[str | None] = mapped_column(String(20))
    mailing_country:       Mapped[str | None] = mapped_column(String(2), server_default="US")
    mailing_instructions:  Mapped[str | None] = mapped_column(String(1000))

    # Preferences & tier
    weight_unit: Mapped[WeightUnit] = mapped_column(
        SAEnum(WeightUnit, name="weight_unit", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=WeightUnit.kg,
        server_default=WeightUnit.kg.value,
    )
    tier: Mapped[OperatorTier] = mapped_column(
        SAEnum(OperatorTier, name="operator_tier", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=OperatorTier.starter,
        server_default=OperatorTier.starter.value,
    )
    status: Mapped[OperatorStatus] = mapped_column(
        SAEnum(OperatorStatus, name="operator_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=OperatorStatus.onboarding,
        server_default=OperatorStatus.onboarding.value,
    )

    # Billing
    stripe_customer_id:  Mapped[str | None]      = mapped_column(String(255))
    subscription_status: Mapped[str | None]      = mapped_column(String(50))
    subscription_start:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_billing_date:   Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Onboarding progress — JSONB so individual keys can be patched cheaply
    onboarding_checklist: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: {
            "profile_complete":       False,
            "first_trip_created":     False,
            "first_booking_received": False,
            "billing_setup":          False,
        },
        server_default=_ONBOARDING_DEFAULT,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # ── Relationships ──────────────────────────────────────────────────────
    trips:    Mapped[list["Trip"]]            = relationship("Trip",            back_populates="operator", lazy="raise")
    contacts: Mapped[list["OperatorContact"]] = relationship("OperatorContact", back_populates="operator", lazy="raise")

    # ── Convenience property ───────────────────────────────────────────────
    @property
    def is_active(self) -> bool:
        return self.status == OperatorStatus.active

    def __repr__(self) -> str:
        return f"<Operator id={self.id} email={self.email!r} status={self.status.value}>"
