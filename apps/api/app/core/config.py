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

# 05 §5. `resend` is the provider, chosen on 2026-09-14 for the prototype's free tier. `folder`
# writes messages into a git-ignored folder and `memory` keeps them for tests; neither boots a
# deployed API.
EmailTransport = Literal["folder", "memory", "resend"]


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
    resend_api_key: SecretStr | None = None
    # Resend's shared test sender reaches only the Resend account owner's own address; real users
    # need a verified domain here.
    email_from: str = "CyberAthlete <onboarding@resend.dev>"
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
    if settings.email_transport == "resend" and settings.resend_api_key is None:
        raise InsecureConfigurationError(
            "EMAIL_TRANSPORT is resend, but RESEND_API_KEY is not set (05 §5)"
        )
    if (
        settings.environment not in DEVELOPMENT_ENVIRONMENTS
        and settings.email_transport != "resend"
    ):
        # A deployed API that cannot send a reset link has locked out anyone who forgets a
        # password. Refusing to start says so on day one instead.
        raise InsecureConfigurationError(
            "a deployed API needs an email provider: set EMAIL_TRANSPORT=resend and RESEND_API_KEY "
            "(05 §5)"
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
