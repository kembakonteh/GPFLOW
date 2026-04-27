from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl
from typing import Literal


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str  # postgresql+asyncpg://user:pass@host/db

    # ── Redis / ARQ ───────────────────────────────────────────────────────
    REDIS_URL: str  # redis://localhost:6379

    # ── Auth ──────────────────────────────────────────────────────────────
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Cloudflare R2 (S3-compatible) ─────────────────────────────────────
    R2_ACCOUNT_ID: str
    R2_ACCESS_KEY: str
    R2_SECRET_KEY: str
    R2_BUCKET_NAME: str
    R2_PUBLIC_URL: AnyHttpUrl  # e.g. https://pub-xxxx.r2.dev

    # ── WhatsApp Cloud API ────────────────────────────────────────────────
    WHATSAPP_TOKEN: str
    WHATSAPP_PHONE_ID: str

    # ── Stripe ────────────────────────────────────────────────────────────
    STRIPE_SECRET_KEY: str
    STRIPE_WEBHOOK_SECRET: str

    # ── App ───────────────────────────────────────────────────────────────
    FRONTEND_URL: AnyHttpUrl  # used for CORS + email links
    ENVIRONMENT: Literal["dev", "prod"] = "dev"


# Single shared instance — import this everywhere
settings = Settings()
