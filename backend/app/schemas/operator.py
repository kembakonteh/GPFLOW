import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.operator import WeightUnit


# ── Auth request schemas ──────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name:          str       = Field(..., min_length=2, max_length=100)
    email:         str
    phone:         str       = Field(..., min_length=7, max_length=20)
    password:      str       = Field(..., min_length=8)
    business_name: str       = Field(..., min_length=2, max_length=100)
    country:       str       = Field(..., min_length=2, max_length=2, description="ISO 3166-1 alpha-2")
    city:          str
    weight_unit:   WeightUnit | None = None  # inferred from country if omitted

    @model_validator(mode="after")
    def infer_weight_unit(self) -> "RegisterRequest":
        """Default to lbs for US operators, kg for everyone else."""
        if self.weight_unit is None:
            self.weight_unit = (
                WeightUnit.lbs if self.country.upper() == "US" else WeightUnit.kg
            )
        return self


class LoginRequest(BaseModel):
    email:    str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


# ── Response schemas ──────────────────────────────────────────────────────────

class OperatorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:                   uuid.UUID
    name:                 str
    email:                str
    phone:                str
    business_name:        str
    logo_url:             str | None
    country:              str
    city:                 str
    weight_unit:          str
    tier:                 str
    status:               str
    onboarding_checklist: dict
    created_at:           datetime
    # password_hash intentionally excluded


class TokenResponse(BaseModel):
    """Returned by the /refresh endpoint — access token only."""
    access_token: str
    token_type:   str = "bearer"


class AuthResponse(BaseModel):
    """Returned by /register and /login — tokens + full operator profile."""
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    operator:      OperatorResponse


# ── Update schema ─────────────────────────────────────────────────────────────

class OperatorUpdate(BaseModel):
    """All fields optional — only supplied fields are written."""
    name:          str | None       = Field(None, min_length=2, max_length=100)
    business_name: str | None       = Field(None, min_length=2, max_length=100)
    city:          str | None       = None
    country:       str | None       = Field(None, min_length=2, max_length=2)
    logo_url:      str | None       = None
    weight_unit:   WeightUnit | None = None


# ── Stats schema ──────────────────────────────────────────────────────────────

class OperatorStats(BaseModel):
    total_trips:         int
    active_trips:        int
    total_bookings:      int
    total_revenue_minor: int   # sum of confirmed_cost_minor for paid bookings
    pending_payments:    int   # bookings with payment_status = unpaid
    items_in_transit:    int   # bookings with status = in_transit
