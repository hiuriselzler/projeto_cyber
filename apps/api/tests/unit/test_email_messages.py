"""Every email exists in both languages, from the shared catalogs, with plain arguments (INV-27,
ADR-008)."""

import pytest

from app.core.email import EMAIL_KINDS, EmailKind, compose
from app.core.i18n import (
    LOCALES,
    CatalogError,
    Locale,
    format_message,
    message,
    message_catalog,
    plain_arguments,
)


def arguments_of(locale: Locale, kind: EmailKind) -> set[str]:
    subject = message(locale, f"email.{kind}.subject")
    body = message(locale, f"email.{kind}.body")
    return plain_arguments(subject) | plain_arguments(body)


def test_the_catalogs_hold_exactly_the_emails_the_api_sends():
    for locale in LOCALES:
        assert set(message_catalog(locale)["email"]) == set(EMAIL_KINDS)


@pytest.mark.parametrize("kind", EMAIL_KINDS)
@pytest.mark.parametrize("locale", LOCALES)
def test_every_email_renders_completely(locale, kind):
    arguments = {name: f"<{name}>" for name in arguments_of(locale, kind)}

    rendered = compose(kind, locale=locale, to="user@example.com", **arguments)

    assert rendered.subject
    assert rendered.body
    assert "{" not in rendered.subject + rendered.body
    for value in arguments.values():
        assert value in rendered.subject + rendered.body


@pytest.mark.parametrize("kind", EMAIL_KINDS)
def test_both_languages_take_the_same_arguments(kind):
    assert arguments_of("en", kind) == arguments_of("pt-BR", kind)


def test_a_portuguese_account_is_written_to_in_portuguese():
    english = compose("password_changed", locale="en", to="a@example.com", name="Ana")
    portuguese = compose("password_changed", locale="pt-BR", to="a@example.com", name="Ana")

    assert "password" in english.subject.lower()
    assert "senha" in portuguese.subject.lower()


def test_a_message_that_needs_a_plural_engine_is_refused():
    with pytest.raises(CatalogError):
        plain_arguments("{count, plural, one {# rep} other {# reps}}")


def test_a_missing_argument_is_refused_rather_than_sent_with_a_hole():
    with pytest.raises(CatalogError, match="name"):
        format_message("en", "email.password_changed.body", {})
