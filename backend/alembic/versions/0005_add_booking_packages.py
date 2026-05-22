"""add booking packages

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-22

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum type first
    op.execute("CREATE TYPE package_scan_status AS ENUM ('pending', 'received', 'delivered')")

    # Add package_count to bookings (default 1 for all existing rows)
    op.add_column("bookings", sa.Column("package_count", sa.Integer(), nullable=False, server_default="1"))

    # Create booking_packages table
    op.create_table(
        "booking_packages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "booking_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bookings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("package_number", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(200), nullable=True),
        sa.Column("weight_kg", sa.Numeric(8, 3), nullable=True),
        sa.Column("qr_code", sa.String(512), nullable=True),
        sa.Column("package_reference", sa.String(30), unique=True, nullable=False),
        sa.Column(
            "scan_status",
            sa.Enum("pending", "received", "delivered", name="package_scan_status", create_type=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_booking_packages_booking_id", "booking_packages", ["booking_id"])
    op.create_index("ix_booking_packages_package_reference", "booking_packages", ["package_reference"])

    # Backfill: create a P1 package for every existing booking so old bookings
    # stay functional with the new per-package weigh and scan flows.
    op.execute("""
        INSERT INTO booking_packages
            (id, booking_id, package_number, package_reference, scan_status, created_at)
        SELECT
            gen_random_uuid(),
            b.id,
            1,
            b.reference_number || '-P1',
            CASE
                WHEN b.status IN ('received','in_transit','ready','collected','delivered','held')
                THEN 'received'
                ELSE 'pending'
            END,
            now()
        FROM bookings b
        WHERE NOT EXISTS (
            SELECT 1 FROM booking_packages bp WHERE bp.booking_id = b.id
        )
    """)

    # Backfill weight_kg on existing P1 packages from confirmed_weight_kg
    op.execute("""
        UPDATE booking_packages bp
        SET weight_kg = b.confirmed_weight_kg
        FROM bookings b
        WHERE bp.booking_id = b.id
          AND b.confirmed_weight_kg IS NOT NULL
          AND bp.package_number = 1
    """)


def downgrade() -> None:
    op.drop_index("ix_booking_packages_package_reference", "booking_packages")
    op.drop_index("ix_booking_packages_booking_id", "booking_packages")
    op.drop_table("booking_packages")
    op.drop_column("bookings", "package_count")
    op.execute("DROP TYPE package_scan_status")
