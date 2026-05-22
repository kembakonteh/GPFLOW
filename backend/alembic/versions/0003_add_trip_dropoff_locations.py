"""add trip dropoff locations

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-22

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trip_dropoff_locations",
        sa.Column("id",            UUID(as_uuid=True), primary_key=True),
        sa.Column("trip_id",       UUID(as_uuid=True), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label",         sa.String(200),  nullable=False),
        sa.Column("address",       sa.String(500),  nullable=True),
        sa.Column("city",          sa.String(100),  nullable=True),
        sa.Column("state",         sa.String(100),  nullable=True),
        sa.Column("display_order", sa.Integer(),    nullable=False, server_default="0"),
        sa.Column("created_at",    sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_trip_dropoff_locations_trip_id", "trip_dropoff_locations", ["trip_id"])


def downgrade() -> None:
    op.drop_index("ix_trip_dropoff_locations_trip_id", table_name="trip_dropoff_locations")
    op.drop_table("trip_dropoff_locations")
