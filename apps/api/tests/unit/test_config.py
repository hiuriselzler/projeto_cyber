import secrets
from typing import Any

import pytest

from app.core.config import (
    KNOWN_DEVELOPMENT_SECRETS,
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


@pytest.mark.parametrize("environment", ["local", "test"])
def test_the_migrator_url_is_allowed_in_local_development(environment):
    environ = {"MIGRATION_DATABASE_URL": "postgresql+psycopg://cyberathlete_migrator@db/x"}

    assert_settings_are_safe(make_settings(environment=environment), environ=environ)
