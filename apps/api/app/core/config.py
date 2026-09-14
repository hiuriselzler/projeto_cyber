"""Settings, read from the environment, and in local development from the repository-root `.env`."""

import os
from collections.abc import Mapping
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]
ENV_FILE = REPO_ROOT / ".env"

MIN_JWT_SECRET_LENGTH = 32

# Values found in templates, tutorials and .env.example. A secret equal to one of them was never
# generated, so the API refuses to boot with it (04 §8).
KNOWN_DEVELOPMENT_SECRETS = frozenset(
    {
        "changeme",
        "change-me",
        "change_me",
        "dev",
        "development",
        "jwt-secret",
        "jwt_secret",
        "password",
        "replace-me",
        "replace-me-with-at-least-32-random-bytes",
        "secret",
        "test",
    }
)

Environment = Literal["local", "test", "staging", "production"]
DEVELOPMENT_ENVIRONMENTS = frozenset({"local", "test"})

# No provider is chosen yet (05 §5, open question 10), so only the two development transports exist:
# a git-ignored folder, and memory for tests. A deployed API refuses to boot until a provider
# adapter joins them.
EmailTransport = Literal["folder", "memory"]


class InsecureConfigurationError(RuntimeError):
    """Configuration that would run the API unsafely. Messages name settings, never their values."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    environment: Environment = "local"
    database_url: SecretStr
    jwt_secret: SecretStr
    database_connect_attempts: int = Field(default=10, ge=1)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    email_transport: EmailTransport = "folder"
    email_folder: Path = REPO_ROOT / "apps" / "api" / ".mail"
    # Where links in emails point: the app's deep-link scheme, from apps/mobile/app.json.
    app_link_base: str = "cyberathlete://"


class MigrationSettings(BaseSettings):
    """Alembic's connection, as cyberathlete_migrator. The running API never loads it (ADR-011)."""

    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    migration_database_url: SecretStr


def assert_settings_are_safe(settings: Settings, environ: Mapping[str, str] = os.environ) -> None:
    secret = settings.jwt_secret.get_secret_value()
    if secret.strip().lower() in KNOWN_DEVELOPMENT_SECRETS:
        raise InsecureConfigurationError(
            "JWT_SECRET is a known development default; generate a random one (04 §8)"
        )
    if len(secret) < MIN_JWT_SECRET_LENGTH:
        raise InsecureConfigurationError(
            f"JWT_SECRET must be at least {MIN_JWT_SECRET_LENGTH} random characters (04 §8)"
        )
    if settings.environment not in DEVELOPMENT_ENVIRONMENTS and "MIGRATION_DATABASE_URL" in environ:
        raise InsecureConfigurationError(
            "MIGRATION_DATABASE_URL must not be in a deployed API's environment (ADR-011)"
        )
    if settings.environment not in DEVELOPMENT_ENVIRONMENTS:
        # Only the development transports exist, and a deployed API that cannot send a reset link
        # has locked out anyone who forgets a password. Refusing to start says so on day one
        # instead.
        raise InsecureConfigurationError(
            "no email provider is configured for a deployed API; "
            "choosing one is open question 10 (05 §5)"
        )


def load_settings(env_file: Path | None = ENV_FILE) -> Settings:
    try:
        settings = Settings(_env_file=env_file)
    except ValidationError as exc:
        # Pydantic's own message echoes the input, which holds DATABASE_URL and its password.
        names = sorted({str(error["loc"][0]).upper() for error in exc.errors() if error["loc"]})
        raise InsecureConfigurationError(
            "missing or invalid settings: " + ", ".join(names)
        ) from None
    assert_settings_are_safe(settings)
    return settings


@lru_cache
def get_settings() -> Settings:
    return load_settings()
