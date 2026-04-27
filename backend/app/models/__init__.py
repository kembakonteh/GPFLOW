# Importing all models here ensures they are registered with Base.metadata
# so Alembic autogenerate and create_all() can discover every table.

from app.models.operator import Operator, OperatorStatus, OperatorTier, WeightUnit
from app.models.trip import PricingModel, Trip, TripDirection, TripStatus
from app.models.booking import Booking, BookingStatus, CollectionType, PaymentStatus
from app.models.trip_update import TripUpdate, UpdateType
from app.models.notification_log import NotificationLog
from app.models.operator_contact import OperatorContact

__all__ = [
    # Models
    "Operator",
    "Trip",
    "Booking",
    "TripUpdate",
    "NotificationLog",
    "OperatorContact",
    # Enums
    "OperatorStatus",
    "OperatorTier",
    "WeightUnit",
    "TripDirection",
    "TripStatus",
    "PricingModel",
    "BookingStatus",
    "CollectionType",
    "PaymentStatus",
    "UpdateType",
]
