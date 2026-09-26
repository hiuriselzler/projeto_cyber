"""The Rust core's progression engine, called from Python — task 005 stage 1 on the server.

These run the same `packages/shared/fixtures/` files the Rust suite reads, fixture #1 among them —
the owner's 40 -> 62.5 kg example. Under ADR-004 option B the arithmetic is one implementation, so
what these prove is that **the PyO3 binding marshals it faithfully**: a field swapped in a boundary
record, a deload mode mapped to the wrong policy, or a date converted one day off would pass Rust's
own tests and fail here.
"""

from datetime import date
from typing import Any

import pytest

from app.domain.progression import (
    ENGINE_VERSION,
    CycleOneSet,
    ExerciseSpec,
    MesocycleSpec,
    PlannedMicrocycle,
    ProgressionRule,
    ProgressionStrategy,
    SessionSpec,
    epoch_day,
    from_epoch_day,
    generate,
    resolve_dates,
)
from app.domain.rounding import RoundingMode
from app.domain.strength import SetType
from tests.fixtures.loader import load_fixture


def _rule(spec: dict[str, Any]) -> ProgressionRule:
    return ProgressionRule(
        strategy=ProgressionStrategy.from_name(spec["strategy"]),
        min_reps=spec["min_reps"],
        max_reps=spec["max_reps"],
        min_rir=spec["min_rir"],
        max_rir=spec["max_rir"],
        rounding=RoundingMode.from_name(spec["rounding"]),
        load_step_kg=spec["load_step_kg"],
        load_step_bp=spec["load_step_bp"],
    )


def _mesocycle(spec: dict[str, Any]) -> MesocycleSpec:
    deload = spec["deload"]
    return MesocycleSpec(
        start_day=epoch_day(date.fromisoformat(spec["start_date"])),
        num_microcycles=spec["num_microcycles"],
        default_length_days=spec["default_length_days"],
        deload_mode=deload["mode"],
        deload_every_n_microcycles=deload.get("every"),
        deload_final_cycle=deload.get("final_cycle", False),
        deload_cycles=deload.get("cycles", []),
        length_overrides={it["cycle_number"]: it["length_days"] for it in spec["length_overrides"]},
        deload_set_bp=spec["deload_set_bp"],
        deload_load_bp=spec["deload_load_bp"],
        deload_rir_bump=spec["deload_rir_bump"],
    )


def _cycle_one(sessions: list[dict[str, Any]]) -> list[SessionSpec]:
    return [
        SessionSpec(
            day_index=session["day_index"],
            order_index=session["order_index"],
            exercises=[
                ExerciseSpec(
                    order_index=exercise["order_index"],
                    increment_kg=exercise["increment_kg"],
                    rule=_rule(exercise["rule"]),
                    sets=[
                        CycleOneSet(
                            set_index=s["set_index"],
                            set_type=SetType.from_name(s["set_type"]),
                            target_weight_kg=s["target_weight_kg"],
                            target_reps=s["target_reps"],
                            target_rir=s["target_rir"],
                        )
                        for s in exercise["sets"]
                    ],
                )
                for exercise in session["exercises"]
            ],
        )
        for session in sessions
    ]


def _sets(cycles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        s
        for cycle in cycles
        for session in cycle["sessions"]
        for exercise in session["exercises"]
        for s in exercise["sets"]
    ]


def _as_fixture(
    cycle: PlannedMicrocycle, increments: dict[int, float], as_steps: bool
) -> dict[str, Any]:
    """A generated cycle in the fixture's own shape, so the two compare as plain data. When the case
    writes its loads as steps, they are compared as steps, multiplied out in Python's arithmetic."""

    def planned_set(s: Any, exercise_order: int) -> dict[str, Any]:
        out: dict[str, Any] = {"set_index": s.set_index, "set_type": s.set_type.name}
        if as_steps and s.target_weight_kg is not None:
            steps = round(s.target_weight_kg / increments[exercise_order])
            assert s.target_weight_kg == steps * increments[exercise_order]
            out["target_weight_steps"] = steps
        else:
            out["target_weight_kg"] = s.target_weight_kg
        out.update(target_reps=s.target_reps, target_rir=s.target_rir, was_clamped=s.was_clamped)
        return out

    return {
        "cycle_number": cycle.cycle_number,
        "starts_on": from_epoch_day(cycle.starts_on).isoformat(),
        "length_days": cycle.length_days,
        "is_deload": cycle.is_deload,
        "sessions": [
            {
                "day_index": session.day_index,
                "order_index": session.order_index,
                "exercises": [
                    {
                        "order_index": exercise.order_index,
                        "sets": [planned_set(s, exercise.order_index) for s in exercise.sets],
                    }
                    for exercise in session.exercises
                ],
            }
            for session in cycle.sessions
        ],
    }


GENERATE = load_fixture("generate")["cases"]


@pytest.mark.parametrize("case", GENERATE, ids=[case["name"] for case in GENERATE])
def test_every_generate_case_agrees(case: dict[str, Any]) -> None:
    block = generate(_mesocycle(case["mesocycle"]), _cycle_one(case["cycle_one"]))

    increments = {
        exercise["order_index"]: exercise["increment_kg"]
        for session in case["cycle_one"]
        for exercise in session["exercises"]
    }
    as_steps = any("target_weight_steps" in s for s in _sets(case["expected"]))

    assert all(cycle.engine_version == ENGINE_VERSION for cycle in block)
    assert [_as_fixture(cycle, increments, as_steps) for cycle in block] == case["expected"]


DATES = load_fixture("resolve_dates")["cases"]


@pytest.mark.parametrize("case", DATES, ids=[case["name"] for case in DATES])
def test_every_resolve_dates_case_agrees(case: dict[str, Any]) -> None:
    starts = resolve_dates(epoch_day(date.fromisoformat(case["start_date"])), case["length_days"])
    assert [from_epoch_day(day).isoformat() for day in starts] == case["expected"]


def test_the_date_helpers_are_each_other_s_inverse_and_count_from_1970() -> None:
    assert epoch_day(date(1970, 1, 1)) == 0
    assert epoch_day(date(2026, 10, 5)) == 20_731
    assert epoch_day(date(1969, 12, 31)) == -1
    for day in (date(2028, 2, 29), date(1999, 12, 31), date(2026, 10, 5)):
        assert from_epoch_day(epoch_day(day)) == day


def test_a_linear_rule_needs_exactly_one_step() -> None:
    for step_kg, step_bp in ((None, None), (2.5, 250)):
        with pytest.raises(ValueError, match="exactly one"):
            ProgressionRule(
                ProgressionStrategy.LinearLoad,
                min_reps=6,
                max_reps=6,
                load_step_kg=step_kg,
                load_step_bp=step_bp,
            )


def test_an_unknown_deload_mode_or_a_missing_n_is_refused() -> None:
    with pytest.raises(ValueError, match="unknown deload mode"):
        MesocycleSpec(start_day=0, num_microcycles=4, default_length_days=7, deload_mode="weekly")
    with pytest.raises(ValueError, match="needs deload_every_n_microcycles"):
        MesocycleSpec(
            start_day=0,
            num_microcycles=4,
            default_length_days=7,
            deload_mode="every_n_microcycles",
        )


def test_a_strategy_not_yet_built_is_refused_by_name() -> None:
    with pytest.raises(ValueError, match="not yet built"):
        ProgressionStrategy.from_name("double_progression")
