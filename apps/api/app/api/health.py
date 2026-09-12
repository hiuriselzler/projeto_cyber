from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.schemas.health import HealthStatus, ReadinessStatus
from app.services.health import HealthService, get_health_service

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> HealthStatus:
    """The process is alive. Says nothing about the database."""
    return HealthStatus()


@router.get(
    "/health/ready",
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ReadinessStatus}},
)
async def ready(
    response: Response,
    service: Annotated[HealthService, Depends(get_health_service)],
) -> ReadinessStatus:
    """Traffic may be sent: Postgres is reachable and its schema is not behind this build."""
    readiness = await service.readiness()
    if not readiness.ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadinessStatus(status="not_ready", reason=readiness.reason)
    return ReadinessStatus(status="ready")
