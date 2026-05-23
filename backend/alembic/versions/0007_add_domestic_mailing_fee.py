"""add domestic mailing fee to trips and bookings

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-23
"""

from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trips",    sa.Column("domestic_mailing_fee", sa.Numeric(10, 2), nullable=True))
    op.add_column("bookings", sa.Column("mailing_fee_charged",  sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "mailing_fee_charged")
    op.drop_column("trips",    "domestic_mailing_fee")
