"""The Rust core, called from Python — the server half of the ADR-004 spike (task 017).

These run the same `packages/shared/fixtures/round_to_increment.json` the Rust suite and the app's
suite read. Under option B agreement is structural rather than hopeful, and these are regression
tests; if the spike had failed they would be the tripwire between two implementations instead.
"""

import pytest

from app.domain.rounding import RoundingMode, core_version, round_to_increment
from tests.fixtures.loader import load_fixture


def test_the_two_values_task_017_names():
    """Task 017's acceptance criterion, called through PyO3 exactly as FastAPI calls it."""
    assert round_to_increment(41.6, 2.5, RoundingMode.Nearest) == 42.5
    # The tie goes to the lighter load (ADR-010 § Amendment), which is why it is 40.0 and not 42.5.
    assert round_to_increment(41.25, 2.5, RoundingMode.Nearest) == 40.0


def test_every_shared_case_agrees():
    for case in load_fixture("round_to_increment")["cases"]:
        mode = RoundingMode.from_name(case["mode"])
        expected = case["expected_steps"] * case["increment_kg"]

        assert round_to_increment(case["weight_kg"], case["increment_kg"], mode) == expected, case[
            "name"
        ]


def test_rounding_is_idempotent():
    """INV-10 in miniature: re-anchoring an anchored load lands in the same place."""
    for mode in (RoundingMode.Nearest, RoundingMode.Down, RoundingMode.Up):
        once = round_to_increment(41.6, 2.5, mode)
        assert round_to_increment(once, 2.5, mode) == once


def test_an_unknown_mode_is_refused_rather_than_guessed():
    """A mode the core does not know is an error, never a silent fall back to `nearest`."""
    with pytest.raises(ValueError, match="ceiling"):
        RoundingMode.from_name("ceiling")


def test_the_core_reports_the_version_it_was_built_from():
    assert core_version() == "0.1.0"
