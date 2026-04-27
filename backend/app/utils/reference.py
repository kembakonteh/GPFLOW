import random
import string
from datetime import UTC, datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession


_CHARS = string.ascii_uppercase + string.digits  # A-Z 0-9


def _random_suffix(length: int = 4) -> str:
    return "".join(random.choices(_CHARS, k=length))


async def generate_booking_ref(db: AsyncSession) -> str:
    """
    Return a unique booking reference in the format GP-YYYY-XXXX.

    Queries the bookings table each attempt to guarantee uniqueness.
    Retries up to 10 times before raising (collision probability is
    negligible at scale: 36^4 = 1.68 M combinations per year).
    """
    year = datetime.now(UTC).year

    for _ in range(10):
        candidate = f"GP-{year}-{_random_suffix()}"

        # Late import to avoid circular dependency at module load time
        from app.models.booking import Booking  # noqa: PLC0415

        result = await db.execute(
            select(Booking.reference).where(Booking.reference == candidate)
        )
        if result.scalar_one_or_none() is None:
            return candidate

    raise RuntimeError("Could not generate a unique booking reference after 10 attempts")
