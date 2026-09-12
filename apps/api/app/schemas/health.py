from typing import Literal

from pydantic import BaseModel


class HealthStatus(BaseModel):
    status: Literal["ok"] = "ok"


class ReadinessStatus(BaseModel):
    status: Literal["ready", "not_ready"]
    reason: Literal["database_unreachable", "migrations_pending"] | None = None
