"""The Rust core's strength module, called from Python — INV-04, INV-07 and FR-2.15 on the server.

These run the same `packages/shared/fixtures/` files the Rust suite and the app's suite read. Under
ADR-004 option B all three reach one implementation, so what these prove is that **the PyO3 binding
marshals it faithfully** — a field swapped in the boundary struct would pass Rust's own tests and
fail here, which is exactly the failure worth catching.
"""

from typing import Any

import pytest

from app.domain.strength import (
    LoggedSet,
    PersonalBests,
    RepsAtWeight,
    SetType,
    counted_set_count,
    detect_prs,
    e1rm,
    e1rm_series,
    is_counted_set,
    load_kg,
    volume_kg,
)
from tests.fixtures.loader import load_fixture

EPLEY_DIVISOR = 30.0


def _build(spec: dict[str, Any]) -> LoggedSet:
    """A fixture's set, with the `set_defaults` each file documents."""
    return LoggedSet(
        set_type=SetType.from_name(spec.get("set_type", "working")),
        is_completed=spec.get("is_completed", True),
        weight_kg=spec.get("weight_kg"),
        reps=spec.get("reps"),
        rir=spec.get("rir"),
        uses_bodyweight=spec.get("uses_bodyweight", False),
        body_weight_kg=spec.get("body_weight_kg"),
        is_deload=spec.get("is_deload", False),
    )


def test_the_case_task_004_names():
    """Body weight 80 kg + 20 kg x 5 at RIR 2 has an e1RM of 123.3 kg."""
    pull_up = LoggedSet(
        set_type=SetType.Working,
        is_completed=True,
        weight_kg=20.0,
        reps=5,
        rir=2,
        uses_bodyweight=True,
        body_weight_kg=80.0,
    )
    assert load_kg(pull_up) == 100.0
    estimate = e1rm(pull_up)
    assert estimate == 100.0 * (1 + 7 / EPLEY_DIVISOR)
    # 123.3 is the display rounding; the core hands back the unrounded value (INV-01's formatting
    # module is what shortens it, and it lives in the app).
    assert estimate is not None
    assert round(estimate, 1) == 123.3

    # Logging a new body weight a week later is a different set's input, not this one's (INV-17).
    heavier = LoggedSet(
        set_type=SetType.Working,
        is_completed=True,
        weight_kg=20.0,
        reps=5,
        rir=2,
        uses_bodyweight=True,
        body_weight_kg=84.0,
    )
    assert e1rm(pull_up) != e1rm(heavier)

    # With no body weight logged by that date, e1RM is NULL rather than a guess.
    unweighed = LoggedSet(
        set_type=SetType.Working,
        is_completed=True,
        weight_kg=20.0,
        reps=5,
        rir=2,
        uses_bodyweight=True,
        body_weight_kg=None,
    )
    assert e1rm(unweighed) is None


def test_every_shared_e1rm_case_agrees():
    for case in load_fixture("e1rm")["cases"]:
        expected = case["expected"]
        want = (
            None
            if expected is None
            else expected["load_kg"] * (1 + expected["effective_reps"] / EPLEY_DIVISOR)
        )
        assert e1rm(_build(case["set"])) == want, case["name"]


def test_every_shared_is_counted_set_case_agrees():
    for case in load_fixture("is_counted_set")["cases"]:
        assert is_counted_set(_build(case["set"])) is case["expected"], case["name"]


def test_every_shared_pr_detection_case_agrees():
    for case in load_fixture("pr_detection")["cases"]:
        previous = PersonalBests(
            max_weight_kg=case["previous"].get("max_weight_kg"),
            best_e1rm_kg=case["previous"].get("best_e1rm_kg"),
            best_session_volume_kg=case["previous"].get("best_session_volume_kg"),
            best_reps_at_weight=[
                RepsAtWeight(best["weight_kg"], best["reps"])
                for best in case["previous"].get("best_reps_at_weight", [])
            ],
        )
        session = [_build(spec) for spec in case["session"]]
        achievements = detect_prs(previous, session)

        # Order is part of the contract: two devices must celebrate the same record first.
        assert [pr.kind.name for pr in achievements] == [
            want["kind"] for want in case["expected"]
        ], case["name"]

        for got, want in zip(achievements, case["expected"], strict=True):
            if want.get("value") is not None:
                assert got.value == want["value"], f"{case['name']}: {want['kind']} value"
            if want.get("weight_kg") is not None:
                assert got.weight_kg == want["weight_kg"], f"{case['name']}: {want['kind']} weight"
            assert got.set_index == want.get("set_index"), f"{case['name']}: {want['kind']} index"


def test_rir_left_blank_is_never_read_as_zero():
    """INV-03, at the boundary: `None` must cross PyO3 as absence, not as 0."""
    unrecorded = LoggedSet(set_type=SetType.Working, is_completed=True, weight_kg=100.0, reps=5)
    to_failure = LoggedSet(
        set_type=SetType.Working, is_completed=True, weight_kg=100.0, reps=5, rir=0
    )
    assert unrecorded.rir is None
    assert e1rm(unrecorded) is None
    assert e1rm(to_failure) == 100.0 * (1 + 5 / EPLEY_DIVISOR)


def test_warm_ups_are_excluded_from_every_total():
    """INV-04, through the binding: the predicate and the totals must agree about the same set."""
    warmup = LoggedSet(set_type=SetType.Warmup, is_completed=True, weight_kg=20.0, reps=10, rir=5)
    working = LoggedSet(set_type=SetType.Working, is_completed=True, weight_kg=100.0, reps=5, rir=2)
    assert is_counted_set(warmup) is False
    assert volume_kg([warmup, working]) == 500.0
    assert counted_set_count([warmup, working]) == 1


def test_a_series_keeps_its_gaps_and_its_order():
    sets = [
        LoggedSet(set_type=SetType.Working, is_completed=True, weight_kg=100.0, reps=5, rir=2),
        LoggedSet(set_type=SetType.Working, is_completed=True, weight_kg=100.0, reps=5),
        LoggedSet(set_type=SetType.Working, is_completed=True, weight_kg=110.0, reps=3, rir=1),
    ]
    assert e1rm_series(sets) == [e1rm(one) for one in sets]
    assert e1rm_series(sets)[1] is None


def test_an_unknown_set_type_is_refused_rather_than_guessed():
    with pytest.raises(ValueError, match="myoreps"):
        SetType.from_name("myoreps")
