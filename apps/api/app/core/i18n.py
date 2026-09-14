"""The shared message catalogs, read by the API for emails and its one web page (INV-27, ADR-008) —
the same files the app reads.

The API carries no ICU plural engine, so the messages it formats take plain `{name}` arguments only.
A message that needs a plural or a select is refused here, loudly, rather than sent with its syntax
showing.
"""

import json
import re
from collections.abc import Mapping
from datetime import date
from functools import lru_cache
from typing import Any, Literal

from app.core.config import REPO_ROOT

CATALOGS = REPO_ROOT / "packages" / "shared" / "i18n"

Locale = Literal["en", "pt-BR"]
LOCALES: tuple[Locale, ...] = ("en", "pt-BR")

_PLAIN_ARGUMENT = re.compile(r"\{([a-z_]+)\}")


class CatalogError(RuntimeError):
    """A key that no catalog has, or a message the API cannot format."""


@lru_cache
def message_catalog(locale: Locale) -> Mapping[str, Any]:
    catalog: Mapping[str, Any] = json.loads(
        (CATALOGS / f"{locale}.json").read_text(encoding="utf-8")
    )
    return catalog


def message(locale: Locale, key: str) -> str:
    node: Any = message_catalog(locale)
    for part in key.split("."):
        if not isinstance(node, Mapping) or part not in node:
            raise CatalogError(f"{key}: missing from {locale}.json")
        node = node[part]
    if not isinstance(node, str):
        raise CatalogError(f"{key}: in {locale}.json, but not a message")
    return node


def plain_arguments(text: str) -> set[str]:
    """The arguments of a plain message; raises if it uses any other ICU syntax."""
    if "{" in _PLAIN_ARGUMENT.sub("", text) or "}" in _PLAIN_ARGUMENT.sub("", text):
        raise CatalogError(f"not a plain message: {text!r}")
    return set(_PLAIN_ARGUMENT.findall(text))


def format_message(locale: Locale, key: str, arguments: Mapping[str, str]) -> str:
    text = message(locale, key)
    missing = plain_arguments(text) - arguments.keys()
    if missing:
        raise CatalogError(f"{key}: no value for {', '.join(sorted(missing))}")
    return _PLAIN_ARGUMENT.sub(lambda match: arguments[match.group(1)], text)


def as_locale(value: str | None) -> Locale:
    """A stored or requested language as the catalogs name it. Anything else reads as English."""
    return "pt-BR" if value == "pt-BR" else "en"


def format_day(locale: Locale, day: date) -> str:
    """A calendar date in numbers, in each language's own order — 2026-09-21, 21/09/2026 — so there
    are no month names to translate and no plural engine is needed."""
    return day.strftime("%d/%m/%Y") if locale == "pt-BR" else day.isoformat()


def preferred_locale(accept_language: str) -> Locale:
    """The language a browser ranks highest among those the catalogs hold; English when it names
    none of them.

    Reads `Accept-Language` by its `q` weights, keeping the browser's order between equal weights.
    Any Portuguese reads as Brazilian Portuguese, the only one the catalogs hold.
    """
    ranked: list[tuple[float, int, str]] = []
    for position, entry in enumerate(accept_language.split(",")):
        tag, _, parameters = entry.strip().partition(";")
        weight = 1.0
        for parameter in parameters.split(";"):
            name, _, value = parameter.strip().partition("=")
            if name.strip() == "q":
                try:
                    weight = float(value)
                except ValueError:
                    weight = 0.0
        if tag.strip() and weight > 0:
            ranked.append((-weight, position, tag.strip().lower()))
    for _, _, tag in sorted(ranked):
        language = tag.split("-")[0]
        if language == "pt":
            return "pt-BR"
        if language == "en":
            return "en"
    return "en"
