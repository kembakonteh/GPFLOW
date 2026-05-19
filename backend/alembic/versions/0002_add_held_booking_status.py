"""add held booking status

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-02

"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL requires ALTER TYPE ... ADD VALUE to add enum values.
    # IF NOT EXISTS prevents failure on re-run.
    op.execute("ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'held'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values directly.
    # A full type recreation would be needed; leave as no-op for safety.
    pass
