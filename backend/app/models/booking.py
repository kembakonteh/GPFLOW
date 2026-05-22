import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ── Enums ─────────────────────────────────────────────────────────────────────

class BookingStatus(str, enum.Enum):
    confirmed  = "confirmed"
    received   = "received"
    in_transit = "in_transit"
    ready      = "ready"
    collected  = "collected"
    delivered  = "delivered"
    held       = "held"       # package not picked up — held for next trip


class CollectionType(str, enum.Enum):
    self_collect       = "self_collect"
    operator_delivers  = "operator_delivers"


class PaymentStatus(str, enum.Enum):
    unpaid   = "unpaid"
    paid     = "paid"
    refunded = "refunded"


class PackageScanStatus(str, enum.Enum):
    pending   = "pending"
    received  = "received"
    delivered = "delivered"


# ── Model ─────────────────────────────────────────────────────────────────────

class Booking(Base):
    # PK
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # FKs
    trip_id:     Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id",     ondelete="RESTRICT"), nullable=False
    )
    operator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("operators.id", ondelete="RESTRICT"), nullable=False
    )

    # Human-readable reference — GP-YYYY-XXXX
    reference_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)

    # ── Sender (in US / UK) ────────────────────────────────────────────────
    sender_name:  Mapped[str]          = mapped_column(String(255), nullable=False)
    sender_phone: Mapped[str]          = mapped_column(String(50),  nullable=False)
    sender_email: Mapped[str | None]   = mapped_column(String(255))

    # ── Recipient (in Gambia or US / UK) ──────────────────────────────────
    recipient_name:  Mapped[str]        = mapped_column(String(255), nullable=False)
    recipient_phone: Mapped[str | None] = mapped_column(String(50))
    recipient_city:  Mapped[str]        = mapped_column(String(100), nullable=False)

    # ── Item ──────────────────────────────────────────────────────────────
    item_description: Mapped[str]        = mapped_column(String(500), nullable=False)
    item_photo_url:   Mapped[str | None] = mapped_column(String(512))
    quantity:         Mapped[int]        = mapped_column(Integer, nullable=False, default=1, server_default="1")

    # ── Weight — two separate fields ───────────────────────────────────────
    # estimated_weight_kg: entered by customer at booking time
    estimated_weight_kg: Mapped[Decimal]        = mapped_column(Numeric(8, 3), nullable=False)
    # confirmed_weight_kg: entered by operator at drop-off; NULL until weighed
    confirmed_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))

    # ── Cost — two separate fields (stored in minor currency units / cents) ─
    # estimated_cost_minor: derived from estimated_weight × rate_per_kg
    estimated_cost_minor: Mapped[int | None] = mapped_column(Integer)
    # confirmed_cost_minor: set when weight is confirmed; NULL until then
    confirmed_cost_minor: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)

    # ── Status ────────────────────────────────────────────────────────────
    status: Mapped[BookingStatus] = mapped_column(
        SAEnum(BookingStatus, name="booking_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=BookingStatus.confirmed,
        server_default=BookingStatus.confirmed.value,
    )
    # collection_type set when trip arrives and operator chooses delivery method
    collection_type: Mapped[CollectionType | None] = mapped_column(
        SAEnum(CollectionType, name="collection_type", values_callable=lambda e: [m.value for m in e])
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(PaymentStatus, name="payment_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=PaymentStatus.unpaid,
        server_default=PaymentStatus.unpaid.value,
    )
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(255))

    # ── QR label ──────────────────────────────────────────────────────────
    qr_label_generated:    Mapped[bool]            = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    qr_label_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    qr_label_url:          Mapped[str | None]      = mapped_column(String(512))

    # ── Scan tracking ─────────────────────────────────────────────────────
    last_scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    scan_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    # ── Delivery address — where operator delivers when collection_type = operator_delivers ─
    delivery_address_line1: Mapped[str | None] = mapped_column(String(255))
    delivery_address_line2: Mapped[str | None] = mapped_column(String(255))
    delivery_city:          Mapped[str | None] = mapped_column(String(100))
    delivery_state:         Mapped[str | None] = mapped_column(String(100))
    delivery_zip:           Mapped[str | None] = mapped_column(String(20))
    delivery_country:       Mapped[str | None] = mapped_column(String(2))
    delivery_notes:         Mapped[str | None] = mapped_column(String(500))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # ── Package count (determines how many BookingPackage rows to create) ─────
    package_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    # ── Relationships ──────────────────────────────────────────────────────
    trip:              Mapped["Trip"]                    = relationship("Trip",            back_populates="bookings")
    operator:          Mapped["Operator"]                = relationship("Operator")
    notification_logs: Mapped[list["NotificationLog"]]   = relationship("NotificationLog", back_populates="booking")
    packages:          Mapped[list["BookingPackage"]]    = relationship("BookingPackage",  back_populates="booking", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return (
            f"<Booking id={self.id} ref={self.reference_number!r} "
            f"status={self.status.value}>"
        )


# ── BookingPackage ─────────────────────────────────────────────────────────────

class BookingPackage(Base):
    __tablename__ = "booking_packages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False
    )

    package_number:    Mapped[int]            = mapped_column(Integer, nullable=False)
    description:       Mapped[str | None]     = mapped_column(String(200))
    weight_kg:         Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    qr_code:           Mapped[str | None]     = mapped_column(String(512))
    package_reference: Mapped[str]            = mapped_column(String(30), unique=True, nullable=False)

    scan_status: Mapped[PackageScanStatus] = mapped_column(
        SAEnum(PackageScanStatus, name="package_scan_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=PackageScanStatus.pending,
        server_default=PackageScanStatus.pending.value,
    )
    scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime]        = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    booking: Mapped["Booking"] = relationship("Booking", back_populates="packages")

    def __repr__(self) -> str:
        return f"<BookingPackage ref={self.package_reference!r} scan={self.scan_status.value}>"
