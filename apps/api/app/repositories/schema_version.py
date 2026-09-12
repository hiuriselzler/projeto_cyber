"""The schema revision Postgres is at.

Schema metadata, not user data, so it takes no user scope: INV-15 governs user-owned rows.
"""

from psycopg import errors as pg_errors
from sqlalchemy import text
from sqlalchemy.exc import InterfaceError, OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.repositories.errors import DatabaseUnavailableError


class SchemaVersionRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def current_revision(self) -> str | None:
        """The revision recorded in `alembic_version`, or None when Alembic has never run."""
        try:
            async with self._session_factory() as session:
                result = await session.execute(text("SELECT version_num FROM alembic_version"))
                return result.scalar_one_or_none()
        except ProgrammingError as exc:
            if isinstance(exc.orig, pg_errors.UndefinedTable):
                return None
            raise
        except (OperationalError, InterfaceError) as exc:
            raise DatabaseUnavailableError from exc
