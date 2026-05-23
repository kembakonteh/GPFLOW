"""rename domestic_mailing_fee to domestic_mailing_rate_per_lb on trips

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-23
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("trips", "domestic_mailing_fee", new_column_name="domestic_mailing_rate_per_lb")


def downgrade() -> None:
    op.alter_column("trips", "domestic_mailing_rate_per_lb", new_column_name="domestic_mailing_fee")
