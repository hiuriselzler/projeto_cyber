"""Languages and dates for the API's emails and its web page (ADR-008, task 019)."""

from datetime import date

import pytest

from app.core.i18n import as_locale, format_day, preferred_locale


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("", "en"),
        ("pt-BR", "pt-BR"),
        ("pt-PT,pt;q=0.9", "pt-BR"),
        ("fr-FR,pt;q=0.8,en;q=0.9", "en"),
        ("fr-FR,pt;q=0.9,en;q=0.8", "pt-BR"),
        ("de, fr", "en"),
        ("en;q=0, pt-BR;q=0.1", "pt-BR"),
        ("pt;q=nonsense, en", "en"),
    ],
)
def test_the_browsers_preferred_language_is_chosen_by_weight(header, expected):
    assert preferred_locale(header) == expected


def test_a_date_is_written_in_numbers_in_each_languages_order():
    day = date(2026, 9, 21)

    assert format_day("en", day) == "2026-09-21"
    assert format_day("pt-BR", day) == "21/09/2026"


def test_a_language_the_catalogs_do_not_hold_reads_as_english():
    assert as_locale("pt-BR") == "pt-BR"
    assert as_locale("fr") == "en"
    assert as_locale(None) == "en"
