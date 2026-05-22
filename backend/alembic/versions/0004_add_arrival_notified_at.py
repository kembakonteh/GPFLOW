"""add arrival_notified_at to trips

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-22

"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trips",
        sa.Column("arrival_notified_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("trips", "arrival_notified_at")
