import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ── Enum ──────────────────────────────────────────────────────────────────────

class UpdateType(str, enum.Enum):
    departed          = "departed"
    landed            = "landed"
    delivery_started  = "delivery_started"
    arrived           = "arrived"
    completed         = "completed"


# ── Model ─────────────────────────────────────────────────────────────────────

class TripUpdate(Base):
    # PK
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # FKs
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    operator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("operators.id", ondelete="CASCADE"), nullable=False
    )

    # Content
    update_type: Mapped[UpdateType] = mapped_column(
        SAEnum(UpdateType, name="update_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    # Operator can override the default template message
    message: Mapped[str | None] = mapped_column(Text)
    notification_channel: Mapped[str] = mapped_column(
        String(50), nullable=False, default="whatsapp", server_default="whatsapp"
    )

    # Delivery stats — filled after notifications are dispatched
    sent_at:            Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    bookings_notified: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # ── Relationships ──────────────────────────────────────────────────────
    trip:     Mapped["Trip"]     = relationship("Trip",     back_populates="updates")
    operator: Mapped["Operator"] = relationship("Operator")

    def __repr__(self) -> str:
        return (
            f"<TripUpdate id={self.id} trip_id={self.trip_id} "
            f"type={self.update_type.value}>"
        )
