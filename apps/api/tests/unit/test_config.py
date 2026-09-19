import secrets
from pathlib import Path
from typing import Any

import pytest

from app.core.config import (
    KNOWN_DEVELOPMENT_SECRETS,
    REPO_ROOT,
    InsecureConfigurationError,
    Settings,
    assert_settings_are_safe,
    load_settings,
)

DATABASE_URL = (
    "postgresql+psycopg://cyberathlete_app:hunter2-db-password@127.0.0.1:5432/cyberathlete"
)


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "database_url": DATABASE_URL,
        "jwt_secret": secrets.token_urlsafe(48),
        **overrides,
    }
    return Settings(_env_file=None, **values)


def test_a_random_secret_is_accepted():
    assert_settings_are_safe(make_settings(), environ={})


@pytest.mark.parametrize("secret", sorted(KNOWN_DEVELOPMENT_SECRETS))
def test_a_known_development_default_is_refused(secret):
    with pytest.raises(InsecureConfigurationError, match="known development default"):
        assert_settings_are_safe(make_settings(jwt_secret=secret), environ={})


def test_a_padded_or_capitalised_default_is_still_refused():
    with pytest.raises(InsecureConfigurationError, match="known development default"):
        assert_settings_are_safe(make_settings(jwt_secret="  ChangeMe "), environ={})


def test_a_short_secret_is_refused():
    with pytest.raises(InsecureConfigurationError, match="at least 32"):
        assert_settings_are_safe(make_settings(jwt_secret="x" * 31), environ={})


def test_a_missing_secret_is_refused_without_echoing_other_values(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.setenv("DATABASE_URL", DATABASE_URL)

    with pytest.raises(InsecureConfigurationError) as error:
        load_settings(env_file=None)

    assert "JWT_SECRET" in str(error.value)
    assert "hunter2" not in str(error.value)
    assert error.value.__cause__ is None
    assert error.value.__suppress_context__


def test_the_migrator_url_is_refused_in_a_deployed_environment():
    environ = {"MIGRATION_DATABASE_URL": "postgresql+psycopg://cyberathlete_migrator@db/x"}

    with pytest.raises(InsecureConfigurationError, match="MIGRATION_DATABASE_URL"):
        assert_settings_are_safe(make_settings(environment="production"), environ=environ)


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_a_deployed_api_refuses_to_boot_without_an_email_provider(environment):
    """A deployed API that cannot send a reset link locks out everyone who forgets a password."""
    with pytest.raises(InsecureConfigurationError, match="email provider"):
        assert_settings_are_safe(make_settings(environment=environment), environ={})


def deployed(environment: str, **overrides: Any) -> Settings:
    """Settings a staging or production API boots with; `overrides` replace any of them."""
    values: dict[str, Any] = {
        "environment": environment,
        "email_transport": "resend",
        "resend_api_key": f"re_{secrets.token_urlsafe(24)}",
        "public_base_url": "https://api.example.com",
        **overrides,
    }
    return make_settings(**values)


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_a_deployed_api_boots_with_resend_configured(environment):
    assert_settings_are_safe(deployed(environment), environ={})


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_a_deployed_api_refuses_a_public_address_that_is_not_https(environment):
    """Links in emails carry single-use tokens (task 019)."""
    settings = deployed(environment, public_base_url="http://api.example.com")

    with pytest.raises(InsecureConfigurationError, match="PUBLIC_BASE_URL"):
        assert_settings_are_safe(settings, environ={})


@pytest.mark.parametrize("environment", ["local", "test"])
def test_local_development_links_to_the_local_api(environment):
    assert make_settings(environment=environment).public_base_url == "http://localhost:8000"
    assert_settings_are_safe(make_settings(environment=environment), environ={})


def test_resend_without_its_key_is_refused_without_echoing_anything():
    with pytest.raises(InsecureConfigurationError, match="RESEND_API_KEY") as error:
        assert_settings_are_safe(make_settings(email_transport="resend"), environ={})

    assert "re_" not in str(error.value)


@pytest.mark.parametrize("environment", ["local", "test"])
def test_the_migrator_url_is_allowed_in_local_development(environment):
    environ = {"MIGRATION_DATABASE_URL": "postgresql+psycopg://cyberathlete_migrator@db/x"}

    assert_settings_are_safe(make_settings(environment=environment), environ=environ)


def test_a_relative_email_folder_is_anchored_to_the_repo_root_not_the_cwd():
    """.env's EMAIL_FOLDER=apps/api/.mail must not resolve against wherever uvicorn was
    launched from (task 017: it landed in apps/api/apps/api/.mail because the README runs
    uvicorn from apps/api)."""
    settings = make_settings(email_folder="apps/api/.mail")

    assert settings.email_folder == REPO_ROOT / "apps" / "api" / ".mail"


def test_an_absolute_email_folder_is_left_untouched(tmp_path: Path):
    absolute = tmp_path / "cyberathlete-mail"

    settings = make_settings(email_folder=absolute)

    assert settings.email_folder == absolute
