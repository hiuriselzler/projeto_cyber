"""FastAPI entry point: `uv run uvicorn app.main:app`."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.errors import install_error_handlers
from app.api.health import router as health_router
from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.db import dispose_database, init_database, verify_database_role
from app.core.logging import configure_logging
from app.core.request_context import RequestContextMiddleware


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Refuse to start on unsafe settings or on a database role that could skip RLS (ADR-011)."""
    settings = get_settings()
    configure_logging(settings.log_level)
    engine = init_database(settings.database_url.get_secret_value())
    try:
        await verify_database_role(engine, attempts=settings.database_connect_attempts)
        yield
    finally:
        await dispose_database()


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title="CyberAthlete API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(RequestContextMiddleware)
    install_error_handlers(app)
    app.include_router(health_router)
    app.include_router(api_router)
    return app


app = create_app()
