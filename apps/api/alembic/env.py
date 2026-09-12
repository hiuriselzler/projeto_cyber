"""Alembic environment. Connects as cyberathlete_migrator, never as the API's role (ADR-011)."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool, text

from app.core.config import MigrationSettings
from app.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# For drafting a revision with --autogenerate only. Every migration is written and reviewed by hand
# (06 §4); a test keeps the models and the migrated schema in step.
target_metadata = Base.metadata


def _database_url() -> str:
    # Tests pass the URL in directly; everything else reads MIGRATION_DATABASE_URL.
    url = config.attributes.get("database_url")
    if isinstance(url, str):
        return url
    return MigrationSettings().migration_database_url.get_secret_value()


def run_migrations_offline() -> None:
    context.configure(url=_database_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
            # The migrator creates alembic_version, so default privileges give the app role DML on
            # it. The API only reads it, for readiness; recording a migration is the migrator's job.
            connection.execute(
                text("REVOKE INSERT, UPDATE, DELETE ON alembic_version FROM cyberathlete_app")
            )


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
