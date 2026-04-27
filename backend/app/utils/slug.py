import random
import re
import string

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


_SLUG_CHARS = string.ascii_lowercase + string.digits  # a-z 0-9


def _slugify(text: str) -> str:
    """Convert arbitrary text to a URL-safe lowercase slug."""
    text = text.lower().strip()
    # Replace spaces and underscores with hyphens
    text = re.sub(r"[\s_]+", "-", text)
    # Remove any character that is not alphanumeric or a hyphen
    text = re.sub(r"[^a-z0-9-]", "", text)
    # Collapse consecutive hyphens
    text = re.sub(r"-{2,}", "-", text)
    return text.strip("-")


def _random_suffix(length: int = 4) -> str:
    return "".join(random.choices(_SLUG_CHARS, k=length))


async def generate_trip_slug(business_name: str, db: AsyncSession) -> str:
    """
    Return a unique trip slug in the format <slugified-name>-XXXX.

    Example: "Amadou Transport" → "amadou-transport-x7k2"

    Retries up to 10 times to guarantee uniqueness against the trips table.
    """
    base = _slugify(business_name)

    for _ in range(10):
        candidate = f"{base}-{_random_suffix()}"

        from app.models.trip import Trip  # noqa: PLC0415

        result = await db.execute(
            select(Trip.public_slug).where(Trip.public_slug == candidate)
        )
        if result.scalar_one_or_none() is None:
            return candidate

    raise RuntimeError(f"Could not generate a unique slug for '{business_name}' after 10 attempts")
