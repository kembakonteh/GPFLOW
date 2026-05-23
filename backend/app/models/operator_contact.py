import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class OperatorContact(Base):
    # PK
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Owner
    operator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("operators.id", ondelete="CASCADE"), nullable=False
    )

    # Contact details
    name:  Mapped[str]        = mapped_column(String(255), nullable=False)
    phone: Mapped[str]        = mapped_column(String(50),  nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))

    # Segmentation — e.g. ["frequent_sender", "recipient"]
    tags: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="'[]'::jsonb"
    )
    opt_in_whatsapp: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    # Aggregate stats — updated on each booking
    trip_count:      Mapped[int]     = mapped_column(Integer,       nullable=False, default=0, server_default="0")
    total_weight_kg: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=0, server_default="0")

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # ── Relationships ──────────────────────────────────────────────────────
    operator: Mapped["Operator"] = relationship("Operator", back_populates="contacts", lazy="raise")

    def __repr__(self) -> str:
        return (
            f"<OperatorContact id={self.id} name={self.name!r} "
            f"phone={self.phone!r}>"
        )
