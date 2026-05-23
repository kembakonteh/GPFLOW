import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class NotificationLog(Base):
    # PK
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # FKs — both nullable so a log can be trip-level or booking-level
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL")
    )
    trip_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="SET NULL")
    )
    operator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("operators.id", ondelete="CASCADE"), nullable=False
    )

    # Addressing
    recipient_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "sender" | "recipient" | "operator"
    phone_number:   Mapped[str] = mapped_column(String(50), nullable=False)

    # Message
    template_name: Mapped[str]  = mapped_column(String(100), nullable=False)
    message_body:  Mapped[str]  = mapped_column(Text,        nullable=False)
    channel:       Mapped[str]  = mapped_column(
        String(50), nullable=False, default="whatsapp", server_default="whatsapp"
    )

    # Delivery tracking
    status: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "sent" | "failed" | "delivered"

    # WhatsApp message ID from the API response — used for delivery receipt matching
    whatsapp_message_id: Mapped[str | None] = mapped_column(String(255))

    sent_at:       Mapped[datetime]        = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    delivered_at:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None]      = mapped_column(String(500))

    # ── Relationships ──────────────────────────────────────────────────────
    booking:  Mapped["Booking | None"]  = relationship("Booking",  back_populates="notification_logs", lazy="raise")
    operator: Mapped["Operator"]        = relationship("Operator",                                      lazy="raise")

    def __repr__(self) -> str:
        return (
            f"<NotificationLog id={self.id} channel={self.channel!r} "
            f"status={self.status!r} recipient={self.recipient_type!r}>"
        )
