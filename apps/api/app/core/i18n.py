"""The shared message catalogs, read by the API for emails (INV-27, ADR-008) — the same files the
app reads.

The API carries no ICU plural engine, so the messages it formats take plain `{name}` arguments only.
A message that needs a plural or a select is refused here, loudly, rather than sent with its syntax
showing.
"""

import json
import re
from collections.abc import Mapping
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
