"""add operator mailing address and booking delivery address

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-22
"""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Operator mailing address
    op.add_column("operators", sa.Column("mailing_address_line1", sa.String(255), nullable=True))
    op.add_column("operators", sa.Column("mailing_address_line2", sa.String(255), nullable=True))
    op.add_column("operators", sa.Column("mailing_city",          sa.String(100), nullable=True))
    op.add_column("operators", sa.Column("mailing_state",         sa.String(100), nullable=True))
    op.add_column("operators", sa.Column("mailing_zip",           sa.String(20),  nullable=True))
    op.add_column("operators", sa.Column("mailing_country",       sa.String(2),   nullable=True, server_default="US"))
    op.add_column("operators", sa.Column("mailing_instructions",  sa.String(1000), nullable=True))

    # Booking delivery address
    op.add_column("bookings", sa.Column("delivery_address_line1", sa.String(255), nullable=True))
    op.add_column("bookings", sa.Column("delivery_address_line2", sa.String(255), nullable=True))
    op.add_column("bookings", sa.Column("delivery_city",          sa.String(100), nullable=True))
    op.add_column("bookings", sa.Column("delivery_state",         sa.String(100), nullable=True))
    op.add_column("bookings", sa.Column("delivery_zip",           sa.String(20),  nullable=True))
    op.add_column("bookings", sa.Column("delivery_country",       sa.String(2),   nullable=True))
    op.add_column("bookings", sa.Column("delivery_notes",         sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "delivery_notes")
    op.drop_column("bookings", "delivery_country")
    op.drop_column("bookings", "delivery_zip")
    op.drop_column("bookings", "delivery_state")
    op.drop_column("bookings", "delivery_city")
    op.drop_column("bookings", "delivery_address_line2")
    op.drop_column("bookings", "delivery_address_line1")

    op.drop_column("operators", "mailing_instructions")
    op.drop_column("operators", "mailing_country")
    op.drop_column("operators", "mailing_zip")
    op.drop_column("operators", "mailing_state")
    op.drop_column("operators", "mailing_city")
    op.drop_column("operators", "mailing_address_line2")
    op.drop_column("operators", "mailing_address_line1")
