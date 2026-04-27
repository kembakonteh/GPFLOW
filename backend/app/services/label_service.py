"""
QR label PDF generation and Cloudflare R2 upload (Part 5).

Layout (A6 = 105 × 148 mm):
  - Header bar: "GPFLOW" left, operator business name right
  - Large QR code top-right
  - Reference number prominent (large, bold) below header
  - FROM / TO section
  - Item description, quantity, estimated weight / cost
  - Footer: "Scan to track · gpflow.app/track/<ref>"
"""

from __future__ import annotations

import io
import logging
from datetime import UTC, datetime

import boto3
from botocore.config import Config

log = logging.getLogger(__name__)

# A6 dimensions in points (1 pt = 1/72 inch; 1 mm = 2.8346 pt)
_A6_W = 297.6   # 105 mm
_A6_H = 419.5   # 148 mm

_MARGIN = 14.0   # ~5 mm margin


# ── QR code generation ────────────────────────────────────────────────────────

def _make_qr_image(data: str) -> "Image":
    """Return a PIL Image of the QR code."""
    import qrcode
    from qrcode.image.pil import PilImage

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=4,
        border=1,
    )
    qr.add_data(data)
    qr.make(fit=True)
    return qr.make_image(image_factory=PilImage).get_image()


# ── PDF generation ────────────────────────────────────────────────────────────

def generate_qr_label_pdf(
    reference_number: str,
    operator_business_name: str,
    sender_name: str,
    recipient_name: str,
    recipient_city: str,
    item_description: str,
    quantity: int,
    estimated_weight_kg: float,
    currency: str,
    estimated_cost_display: str | None,
    tracking_url: str,
) -> bytes:
    """
    Render an A6 PDF label and return raw bytes.
    """
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.utils import ImageReader

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(_A6_W, _A6_H))
    c.setTitle(f"GPFLOW Label – {reference_number}")

    # ── Header bar ────────────────────────────────────────────────────────
    header_h = 28.0
    c.setFillColor(colors.HexColor("#1a1a2e"))
    c.rect(0, _A6_H - header_h, _A6_W, header_h, fill=1, stroke=0)

    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(_MARGIN, _A6_H - header_h + 8, "GPFLOW")

    c.setFont("Helvetica", 8)
    biz_name = operator_business_name[:32]  # truncate if very long
    c.drawRightString(_A6_W - _MARGIN, _A6_H - header_h + 10, biz_name)

    # ── QR code (top-right, 62 × 62 pt) ──────────────────────────────────
    qr_size = 70.0
    qr_x = _A6_W - _MARGIN - qr_size
    qr_y = _A6_H - header_h - qr_size - 6

    try:
        pil_img = _make_qr_image(tracking_url)
        qr_reader = ImageReader(pil_img)
        c.drawImage(qr_reader, qr_x, qr_y, width=qr_size, height=qr_size)
    except Exception:
        log.warning("QR image render failed; skipping QR on label")

    # ── Reference number ──────────────────────────────────────────────────
    ref_y = _A6_H - header_h - 20
    c.setFillColor(colors.HexColor("#1a1a2e"))
    c.setFont("Helvetica-Bold", 16)
    c.drawString(_MARGIN, ref_y, reference_number)

    # ── Divider ───────────────────────────────────────────────────────────
    div_y = ref_y - 12
    c.setStrokeColor(colors.HexColor("#dddddd"))
    c.setLineWidth(0.5)
    c.line(_MARGIN, div_y, _A6_W - _MARGIN, div_y)

    # ── FROM / TO ─────────────────────────────────────────────────────────
    y = div_y - 14
    c.setFillColor(colors.HexColor("#888888"))
    c.setFont("Helvetica", 7)
    c.drawString(_MARGIN, y, "FROM")

    y -= 11
    c.setFillColor(colors.HexColor("#1a1a2e"))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(_MARGIN, y, sender_name[:50])

    y -= 14
    c.setFillColor(colors.HexColor("#888888"))
    c.setFont("Helvetica", 7)
    c.drawString(_MARGIN, y, "TO")

    y -= 11
    c.setFillColor(colors.HexColor("#1a1a2e"))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(_MARGIN, y, recipient_name[:50])

    y -= 10
    c.setFont("Helvetica", 8)
    c.setFillColor(colors.HexColor("#555555"))
    c.drawString(_MARGIN, y, recipient_city[:50])

    # ── Divider ───────────────────────────────────────────────────────────
    y -= 10
    c.setStrokeColor(colors.HexColor("#dddddd"))
    c.line(_MARGIN, y, _A6_W - _MARGIN, y)

    # ── Item details ──────────────────────────────────────────────────────
    y -= 13
    c.setFillColor(colors.HexColor("#888888"))
    c.setFont("Helvetica", 7)
    c.drawString(_MARGIN, y, "ITEM DESCRIPTION")

    y -= 11
    c.setFillColor(colors.HexColor("#1a1a2e"))
    c.setFont("Helvetica", 9)
    # Word-wrap long descriptions to 2 lines max
    desc = item_description[:80]
    c.drawString(_MARGIN, y, desc[:55])
    if len(desc) > 55:
        y -= 10
        c.drawString(_MARGIN, y, desc[55:])

    y -= 14
    # Quantity · Weight · Cost in one row
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(colors.HexColor("#1a1a2e"))
    col1_x = _MARGIN
    col2_x = _MARGIN + 80
    col3_x = _MARGIN + 170

    c.setFillColor(colors.HexColor("#888888"))
    c.setFont("Helvetica", 7)
    c.drawString(col1_x, y, "QTY")
    c.drawString(col2_x, y, "EST. WEIGHT")
    c.drawString(col3_x, y, "EST. COST")

    y -= 11
    c.setFillColor(colors.HexColor("#1a1a2e"))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(col1_x, y, str(quantity))
    c.drawString(col2_x, y, f"{estimated_weight_kg:.2f} kg")
    c.drawString(col3_x, y, estimated_cost_display or "TBD")

    # ── Footer ────────────────────────────────────────────────────────────
    footer_y = 18
    c.setFillColor(colors.HexColor("#f5f5f5"))
    c.rect(0, 0, _A6_W, footer_y + 6, fill=1, stroke=0)

    c.setFillColor(colors.HexColor("#555555"))
    c.setFont("Helvetica", 6.5)
    c.drawCentredString(_A6_W / 2, footer_y - 2, f"Scan to track  ·  {tracking_url}")

    c.save()
    return buf.getvalue()


# ── R2 upload ─────────────────────────────────────────────────────────────────

def _get_r2_client():
    """Build a boto3 S3 client pointed at Cloudflare R2."""
    from app.core.config import settings

    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY,
        aws_secret_access_key=settings.R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def upload_label_to_r2(booking_id: str, reference_number: str, pdf_bytes: bytes) -> str:
    """
    Upload the PDF to R2 and return the public URL.
    Key pattern: labels/<booking_id>/<reference>.pdf
    """
    from app.core.config import settings

    key = f"labels/{booking_id}/{reference_number}.pdf"
    client = _get_r2_client()
    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=pdf_bytes,
        ContentType="application/pdf",
    )
    public_base = str(settings.R2_PUBLIC_URL).rstrip("/")
    return f"{public_base}/{key}"


def get_label_download_url(booking_id: str, reference_number: str, expires: int = 3600) -> str:
    """
    Return a presigned URL for downloading the label PDF directly from R2.
    Expires in `expires` seconds (default 1 hour).
    """
    from app.core.config import settings

    key = f"labels/{booking_id}/{reference_number}.pdf"
    client = _get_r2_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.R2_BUCKET_NAME, "Key": key},
        ExpiresIn=expires,
    )


# ── Orchestrator (called by route + worker) ───────────────────────────────────

def build_tracking_url(reference_number: str) -> str:
    from app.core.config import settings
    base = str(settings.FRONTEND_URL).rstrip("/")
    return f"{base}/track/{reference_number}"


async def generate_and_store_label(
    booking,          # Booking ORM instance (relations already loaded)
    db,               # AsyncSession — used to persist qr_label_url + flag
) -> str:
    """
    Full pipeline: generate PDF → upload to R2 → persist URL on booking.
    Returns the public R2 URL.
    """
    from sqlalchemy import update as sa_update
    from app.models.booking import Booking

    tracking_url = build_tracking_url(booking.reference_number)

    trip = booking.trip
    operator = booking.operator

    estimated_cost_display = None
    if booking.estimated_cost_minor is not None:
        estimated_cost_display = f"{booking.currency} {booking.estimated_cost_minor / 100:.2f}"

    pdf_bytes = generate_qr_label_pdf(
        reference_number=booking.reference_number,
        operator_business_name=operator.business_name or operator.name,
        sender_name=booking.sender_name,
        recipient_name=booking.recipient_name,
        recipient_city=booking.recipient_city,
        item_description=booking.item_description,
        quantity=booking.quantity,
        estimated_weight_kg=float(booking.estimated_weight_kg),
        currency=booking.currency,
        estimated_cost_display=estimated_cost_display,
        tracking_url=tracking_url,
    )

    url = upload_label_to_r2(str(booking.id), booking.reference_number, pdf_bytes)

    # Persist to DB
    await db.execute(
        sa_update(Booking)
        .where(Booking.id == booking.id)
        .values(
            qr_label_url=url,
            qr_label_generated=True,
            qr_label_generated_at=datetime.now(UTC),
        )
    )
    await db.commit()
    return url
