from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import engine
from app.core.errors import GPFlowError
from app.core.redis import close_redis_pool

# ── Routers ───────────────────────────────────────────────────────────────────
from app.api.v1.routes.auth      import router as auth_router
from app.api.v1.routes.operators import router as operators_router
from app.api.v1.routes.trips     import router as trips_router
from app.api.v1.routes.bookings  import router as bookings_router
from app.api.v1.routes.labels    import router as labels_router
from app.api.v1.routes.webhooks  import router as webhooks_router

_API_V1 = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — schema is managed entirely by Alembic migrations.
    # Run `alembic upgrade head` before starting the server.
    yield

    # Shutdown
    await close_redis_pool()
    await engine.dispose()


app = FastAPI(
    title="GPFLOW API",
    version="0.1.0",
    description="B2B SaaS platform for Gambian diaspora GP parcel operators",
    docs_url="/docs"  if settings.ENVIRONMENT == "dev" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT == "dev" else None,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(settings.FRONTEND_URL).rstrip("/")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception handler — converts GPFlowError → standard JSON envelope ─────────
@app.exception_handler(GPFlowError)
async def gpflow_error_handler(request: Request, exc: GPFlowError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": exc.code},
    )

# ── Register routers ──────────────────────────────────────────────────────────
app.include_router(auth_router,      prefix=_API_V1)
app.include_router(operators_router, prefix=_API_V1)
app.include_router(trips_router,     prefix=_API_V1)
app.include_router(bookings_router,  prefix=_API_V1)
app.include_router(labels_router,    prefix=_API_V1)
app.include_router(webhooks_router,  prefix=_API_V1)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "environment": settings.ENVIRONMENT}
