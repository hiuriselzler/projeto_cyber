"""Liveness and readiness (06 §5)."""

from dataclasses import dataclass
from typing import Literal, Protocol

from app.core.db import get_session_factory
from app.core.migrations import migration_tree
from app.repositories.errors import DatabaseUnavailableError
from app.repositories.schema_version import SchemaVersionRepository

NotReadyReason = Literal["database_unreachable", "migrations_pending"]


class SchemaVersionReader(Protocol):
    async def current_revision(self) -> str | None: ...


@dataclass(frozen=True)
class Readiness:
    ready: bool
    reason: NotReadyReason | None = None


class HealthService:
    def __init__(
        self, schema_versions: SchemaVersionReader, *, head: str, known_revisions: frozenset[str]
    ) -> None:
        self._schema_versions = schema_versions
        self._head = head
        self._known_revisions = known_revisions

    async def readiness(self) -> Readiness:
        try:
            current = await self._schema_versions.current_revision()
        except DatabaseUnavailableError:
            return Readiness(ready=False, reason="database_unreachable")

        if current is None:
            return Readiness(ready=False, reason="migrations_pending")
        if current != self._head and current in self._known_revisions:
            return Readiness(ready=False, reason="migrations_pending")
        # At head — or at a revision this build does not know, which a later release applied.
        # Expand/contract keeps this build compatible with that schema, and treating it as not ready
        # would make rolling back to this build impossible (06 §4, §5).
        return Readiness(ready=True)


def get_health_service() -> HealthService:
    tree = migration_tree()
    return HealthService(
        SchemaVersionRepository(get_session_factory()),
        head=tree.head,
        known_revisions=tree.known_revisions,
    )
