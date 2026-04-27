"""Initial schema — all tables

Revision ID: 0001
Revises:
Create Date: 2026-04-17 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ONBOARDING_DEFAULT = (
    '{"profile_complete": false, "first_trip_created": false, '
    '"first_booking_received": false, "billing_setup": false}'
)

# ── Pre-define all enum types with create_type=False ─────────────────────────
# We create the pg types manually via raw SQL first, then reference them here.
t_operator_tier   = postgresql.ENUM("starter", "regular", "pro",                                                        name="operator_tier",   create_type=False)
t_operator_status = postgresql.ENUM("onboarding", "active", "suspended",                                                name="operator_status", create_type=False)
t_weight_unit     = postgresql.ENUM("kg", "lbs",                                                                        name="weight_unit",     create_type=False)
t_trip_direction  = postgresql.ENUM("outbound", "inbound",                                                              name="trip_direction",  create_type=False)
t_trip_status     = postgresql.ENUM("draft", "open", "closed", "in_transit", "arrived", "completed",                   name="trip_status",     create_type=False)
t_pricing_model   = postgresql.ENUM("per_kg", "per_item", "flat",                                                       name="pricing_model",   create_type=False)
t_booking_status  = postgresql.ENUM("confirmed", "received", "in_transit", "ready", "collected", "delivered",          name="booking_status",  create_type=False)
t_collection_type = postgresql.ENUM("self_collect", "operator_delivers",                                                name="collection_type", create_type=False)
t_payment_status  = postgresql.ENUM("unpaid", "paid", "refunded",                                                       name="payment_status",  create_type=False)
t_update_type     = postgresql.ENUM("departed", "landed", "delivery_started", "arrived", "completed",                  name="update_type",     create_type=False)


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. Create all PostgreSQL ENUM types via raw SQL ───────────────────
    # Using DO blocks so re-runs are safe.
    enum_ddl = [
        "DO $$ BEGIN CREATE TYPE operator_tier   AS ENUM ('starter','regular','pro');                                                       EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE operator_status AS ENUM ('onboarding','active','suspended');                                               EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE weight_unit     AS ENUM ('kg','lbs');                                                                      EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE trip_direction  AS ENUM ('outbound','inbound');                                                            EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE trip_status     AS ENUM ('draft','open','closed','in_transit','arrived','completed');                      EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE pricing_model   AS ENUM ('per_kg','per_item','flat');                                                      EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE booking_status  AS ENUM ('confirmed','received','in_transit','ready','collected','delivered');             EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE collection_type AS ENUM ('self_collect','operator_delivers');                                              EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE payment_status  AS ENUM ('unpaid','paid','refunded');                                                      EXCEPTION WHEN duplicate_object THEN NULL; END $$",
        "DO $$ BEGIN CREATE TYPE update_type     AS ENUM ('departed','landed','delivery_started','arrived','completed');                    EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    ]
    for ddl in enum_ddl:
        conn.execute(sa.text(ddl))

    # ── 2. operators ──────────────────────────────────────────────────────
    op.create_table(
        "operators",
        sa.Column("id",            postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name",          sa.String(255), nullable=False),
        sa.Column("email",         sa.String(255), nullable=False),
        sa.Column("phone",         sa.String(50),  nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("business_name", sa.String(255), nullable=False),
        sa.Column("logo_url",      sa.String(512), nullable=True),
        sa.Column("country",       sa.String(100), nullable=False),
        sa.Column("city",          sa.String(100), nullable=False),
        sa.Column("weight_unit",   t_weight_unit,     nullable=False, server_default="kg"),
        sa.Column("tier",          t_operator_tier,   nullable=False, server_default="starter"),
        sa.Column("status",        t_operator_status, nullable=False, server_default="onboarding"),
        sa.Column("stripe_customer_id",  sa.String(255),          nullable=True),
        sa.Column("subscription_status", sa.String(50),           nullable=True),
        sa.Column("subscription_start",  sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_billing_date",   sa.DateTime(timezone=True), nullable=True),
        sa.Column("onboarding_checklist", postgresql.JSONB(), nullable=False, server_default=sa.text(f"'{_ONBOARDING_DEFAULT}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_operators_email", "operators", ["email"], unique=True)
    op.create_index("ix_operators_phone", "operators", ["phone"], unique=True)

    # ── 3. trips ──────────────────────────────────────────────────────────
    op.create_table(
        "trips",
        sa.Column("id",          postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("operator_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("operators.id", ondelete="CASCADE"), nullable=False),
        sa.Column("direction",           t_trip_direction, nullable=False),
        sa.Column("origin_city",         sa.String(100), nullable=False),
        sa.Column("origin_country",      sa.String(2),   nullable=False),
        sa.Column("destination_city",    sa.String(100), nullable=False),
        sa.Column("destination_country", sa.String(2),   nullable=False),
        sa.Column("departure_date", sa.Date, nullable=False),
        sa.Column("cutoff_date",    sa.Date, nullable=False),
        sa.Column("status",         t_trip_status,    nullable=False, server_default="draft"),
        sa.Column("pricing_model",  t_pricing_model,  nullable=False),
        sa.Column("rate_per_kg",    sa.Numeric(10, 4), nullable=False),
        sa.Column("currency",       sa.String(3),      nullable=False),
        sa.Column("capacity_kg",    sa.Numeric(8, 2),  nullable=True),
        sa.Column("accepted_item_types", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("customs_advisory",    sa.Text,        nullable=True),
        sa.Column("public_slug",         sa.String(120), nullable=False),
        sa.Column("view_count",          sa.Integer,     nullable=False, server_default="0"),
        sa.Column("pickup_location", sa.String(255), nullable=True),
        sa.Column("pickup_window",   sa.String(100), nullable=True),
        sa.Column("pickup_notes",    sa.Text,        nullable=True),
        sa.Column("arrived_at",      sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_trips_operator_id", "trips", ["operator_id"])
    op.create_index("ix_trips_public_slug", "trips", ["public_slug"], unique=True)
    op.create_index("ix_trips_status",      "trips", ["status"])

    # ── 4. bookings ───────────────────────────────────────────────────────
    op.create_table(
        "bookings",
        sa.Column("id",          postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("trip_id",     postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("trips.id",     ondelete="RESTRICT"), nullable=False),
        sa.Column("operator_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("operators.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reference_number", sa.String(20), nullable=False),
        sa.Column("sender_name",  sa.String(255), nullable=False),
        sa.Column("sender_phone", sa.String(50),  nullable=False),
        sa.Column("sender_email", sa.String(255), nullable=True),
        sa.Column("recipient_name",  sa.String(255), nullable=False),
        sa.Column("recipient_phone", sa.String(50),  nullable=True),
        sa.Column("recipient_city",  sa.String(100), nullable=False),
        sa.Column("item_description", sa.String(500), nullable=False),
        sa.Column("item_photo_url",   sa.String(512), nullable=True),
        sa.Column("quantity",         sa.Integer,     nullable=False, server_default="1"),
        sa.Column("estimated_weight_kg", sa.Numeric(8, 3), nullable=False),
        sa.Column("confirmed_weight_kg", sa.Numeric(8, 3), nullable=True),
        sa.Column("estimated_cost_minor", sa.Integer, nullable=True),
        sa.Column("confirmed_cost_minor", sa.Integer, nullable=True),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("status",          t_booking_status,  nullable=False, server_default="confirmed"),
        sa.Column("collection_type", t_collection_type, nullable=True),
        sa.Column("payment_status",  t_payment_status,  nullable=False, server_default="unpaid"),
        sa.Column("stripe_payment_intent_id", sa.String(255), nullable=True),
        sa.Column("qr_label_generated",    sa.Boolean,              nullable=False, server_default="false"),
        sa.Column("qr_label_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("qr_label_url",          sa.String(512),          nullable=True),
        sa.Column("last_scanned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scan_count",      sa.Integer,                  nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_bookings_trip_id",          "bookings", ["trip_id"])
    op.create_index("ix_bookings_operator_id",      "bookings", ["operator_id"])
    op.create_index("ix_bookings_reference_number", "bookings", ["reference_number"], unique=True)
    op.create_index("ix_bookings_status",           "bookings", ["status"])
    op.create_index("ix_bookings_sender_phone",     "bookings", ["sender_phone"])

    # ── 5. trip_updates ───────────────────────────────────────────────────
    op.create_table(
        "trip_updates",
        sa.Column("id",          postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("trip_id",     postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("trips.id",     ondelete="CASCADE"), nullable=False),
        sa.Column("operator_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("operators.id", ondelete="CASCADE"), nullable=False),
        sa.Column("update_type",          t_update_type, nullable=False),
        sa.Column("message",              sa.Text,       nullable=True),
        sa.Column("notification_channel", sa.String(50), nullable=False, server_default="whatsapp"),
        sa.Column("sent_at",              sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("bookings_notified",    sa.Integer,    nullable=False, server_default="0"),
    )
    op.create_index("ix_trip_updates_trip_id", "trip_updates", ["trip_id"])

    # ── 6. notification_logs ──────────────────────────────────────────────
    op.create_table(
        "notification_logs",
        sa.Column("id",          postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("booking_id",  postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("trip_id",     postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("trips.id",    ondelete="SET NULL"), nullable=True),
        sa.Column("operator_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("operators.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recipient_type",      sa.String(20),  nullable=False),
        sa.Column("phone_number",        sa.String(50),  nullable=False),
        sa.Column("template_name",       sa.String(100), nullable=False),
        sa.Column("message_body",        sa.Text,        nullable=False),
        sa.Column("channel",             sa.String(50),  nullable=False, server_default="whatsapp"),
        sa.Column("status",              sa.String(20),  nullable=False),
        sa.Column("whatsapp_message_id", sa.String(255), nullable=True),
        sa.Column("sent_at",             sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("delivered_at",        sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message",       sa.String(500), nullable=True),
    )
    op.create_index("ix_notification_logs_booking_id",          "notification_logs", ["booking_id"])
    op.create_index("ix_notification_logs_whatsapp_message_id", "notification_logs", ["whatsapp_message_id"])

    # ── 7. operator_contacts ──────────────────────────────────────────────
    op.create_table(
        "operator_contacts",
        sa.Column("id",          postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("operator_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("operators.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name",            sa.String(255),    nullable=False),
        sa.Column("phone",           sa.String(50),     nullable=False),
        sa.Column("email",           sa.String(255),    nullable=True),
        sa.Column("tags",            postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("opt_in_whatsapp", sa.Boolean,        nullable=False, server_default="true"),
        sa.Column("trip_count",      sa.Integer,        nullable=False, server_default="0"),
        sa.Column("total_weight_kg", sa.Numeric(8, 2),  nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_operator_contacts_operator_id", "operator_contacts", ["operator_id"])


def downgrade() -> None:
    op.drop_table("operator_contacts")
    op.drop_table("notification_logs")
    op.drop_table("trip_updates")
    op.drop_table("bookings")
    op.drop_table("trips")
    op.drop_table("operators")

    conn = op.get_bind()
    for name in [
        "update_type", "payment_status", "collection_type", "booking_status",
        "pricing_model", "trip_status", "trip_direction",
        "weight_unit", "operator_status", "operator_tier",
    ]:
        conn.execute(sa.text(f"DROP TYPE IF EXISTS {name}"))
