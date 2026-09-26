"""The Rust core's progression engine, called from Python — task 005 on the server.

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
    CycleStatus,
    ExerciseSpec,
    MesocycleSpec,
    Outcome,
    PlanCycle,
    PlanExercise,
    PlanLog,
    PlannedMicrocycle,
    PlanRefused,
    PlanSession,
    PlanSet,
    ProgressionRule,
    ProgressionStrategy,
    SessionSpec,
    SetOrigin,
    WriteKind,
    classify,
    epoch_day,
    extend,
    from_epoch_day,
    generate,
    reconcile,
    relength,
    resolve_dates,
    settle_statuses,
    shorten,
    switch_rule,
)
from app.domain.rounding import RoundingMode
from app.domain.strength import LoggedSet, SetType
from tests.fixtures.loader import load_fixture


def _rule(spec: dict[str, Any]) -> ProgressionRule:
    """A `progression_rules` row as the fixture writes it — every column, null where unread."""
    return ProgressionRule(
        strategy=ProgressionStrategy.from_name(spec["strategy"]),
        min_reps=spec["min_reps"],
        max_reps=spec["max_reps"],
        min_rir=spec["min_rir"],
        max_rir=spec["max_rir"],
        rounding=RoundingMode.from_name(spec["rounding"]),
        load_step_kg=spec["load_step_kg"],
        load_step_bp=spec["load_step_bp"],
        rep_step=spec["rep_step"],
        percent_wave_bp=spec["percent_wave_bp"] or [],
        baseline_e1rm_kg=spec["baseline_e1rm_kg"],
        rir_start=spec["rir_start"],
        rir_end=spec["rir_end"],
        rir_mode=spec["rir_mode"],
        rir_offsets=spec["rir_offsets"] or [],
        failure_policy=spec["failure_policy"],
        failure_load_bp=spec["failure_load_bp"],
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
                    uses_bodyweight=exercise["uses_bodyweight"],
                    body_weight_kg=exercise["body_weight_kg"],
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
        out.update(
            target_reps=s.target_reps,
            target_min_reps=s.target_min_reps,
            target_max_reps=s.target_max_reps,
            target_rir=s.target_rir,
            was_clamped=s.was_clamped,
        )
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


@pytest.mark.parametrize(
    "strategy",
    [
        ProgressionStrategy.LinearLoad,
        ProgressionStrategy.DoubleProgression,
        ProgressionStrategy.RirAutoregulated,
    ],
    ids=lambda it: it.name,
)
def test_a_stepping_rule_needs_exactly_one_step(strategy: ProgressionStrategy) -> None:
    for step_kg, step_bp in ((None, None), (2.5, 250)):
        with pytest.raises(ValueError, match="exactly one"):
            ProgressionRule(
                strategy,
                min_reps=6,
                max_reps=6,
                load_step_kg=step_kg,
                load_step_bp=step_bp,
            )


def test_percent_1rm_needs_its_baseline() -> None:
    # FR-3.2c, and the schema's CHECK: the baseline is what makes generation total.
    with pytest.raises(ValueError, match="baseline_e1rm_kg"):
        ProgressionRule(
            ProgressionStrategy.Percent1rm, min_reps=5, max_reps=5, percent_wave_bp=[7000]
        )


def test_an_unknown_rir_mode_is_refused() -> None:
    with pytest.raises(ValueError, match="unknown rir_mode"):
        ProgressionRule(ProgressionStrategy.Fixed, min_reps=5, max_reps=5, rir_mode="ladder")


def test_every_v1_strategy_round_trips_by_name() -> None:
    for name in (
        "fixed",
        "linear_load",
        "double_progression",
        "percent_1rm",
        "rir_autoregulated",
    ):
        assert ProgressionStrategy.from_name(name).name == name


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


def test_cycle_pattern_is_refused_by_name_as_v2() -> None:
    # 01 §3.2 (e): the enum value exists in the schema, the arm does not — unimplemented, not
    # half-implemented.
    with pytest.raises(ValueError, match="v2"):
        ProgressionStrategy.from_name("cycle_pattern")


# ── reconcile (stage 3a) ──────────────────────────────────────────────────────────────────────────


def _plan(cycles: list[dict[str, Any]]) -> list[PlanCycle]:
    return [
        PlanCycle(
            cycle_number=cycle["cycle_number"],
            length_days=cycle["length_days"],
            starts_on=epoch_day(date.fromisoformat(cycle["starts_on"])),
            is_deload=cycle["is_deload"],
            status=CycleStatus.from_name(cycle["status"]),
            engine_version=cycle["engine_version"],
            last_write_kind=WriteKind.from_name(cycle["last_write_kind"]),
            sessions=[
                PlanSession(
                    day_index=session["day_index"],
                    order_index=session["order_index"],
                    exercises=[
                        PlanExercise(
                            order_index=exercise["order_index"],
                            exercise_id=exercise["exercise_id"],
                            increment_kg=exercise["increment_kg"],
                            rule=_rule(exercise["rule"]),
                            sets=[
                                PlanSet(
                                    set_index=s["set_index"],
                                    set_type=SetType.from_name(s["set_type"]),
                                    target_weight_kg=s["target_weight_kg"],
                                    target_reps=s["target_reps"],
                                    target_min_reps=s["target_min_reps"],
                                    target_max_reps=s["target_max_reps"],
                                    target_rir=s["target_rir"],
                                    was_clamped=s["was_clamped"],
                                    origin=SetOrigin.from_name(s["origin"]),
                                    is_pinned=s["is_pinned"],
                                )
                                for s in exercise["sets"]
                            ],
                            uses_bodyweight=exercise["uses_bodyweight"],
                            body_weight_kg=exercise["body_weight_kg"],
                        )
                        for exercise in session["exercises"]
                    ],
                )
                for session in cycle["sessions"]
            ],
        )
        for cycle in cycles
    ]


def _logs(logs: list[dict[str, Any]]) -> list[PlanLog]:
    return [
        PlanLog(
            cycle_number=log["cycle_number"],
            day_index=log["day_index"],
            session_order_index=log["session_order_index"],
            exercise_order_index=log["exercise_order_index"],
            set_index=log["set_index"],
            set=LoggedSet(
                set_type=SetType.from_name(log["set"]["set_type"]),
                is_completed=log["set"]["is_completed"],
                weight_kg=log["set"]["weight_kg"],
                reps=log["set"]["reps"],
                rir=log["set"]["rir"],
                uses_bodyweight=log["set"]["uses_bodyweight"],
                body_weight_kg=log["set"]["body_weight_kg"],
                is_deload=log["set"]["is_deload"],
            ),
        )
        for log in logs
    ]


def _cycle_as_fixture(cycle: PlanCycle) -> dict[str, Any]:
    """A reconciled cycle as plain data, every field a fixture writes except the rule: the engine
    passes it through untouched, a `ProgressionRule` exposes none of its fields to Python, and the
    Rust suite compares it whole."""
    return {
        "cycle_number": cycle.cycle_number,
        "starts_on": from_epoch_day(cycle.starts_on).isoformat(),
        "length_days": cycle.length_days,
        "is_deload": cycle.is_deload,
        "status": cycle.status.name,
        "engine_version": cycle.engine_version,
        "last_write_kind": cycle.last_write_kind.name,
        "sessions": [
            {
                "day_index": session.day_index,
                "order_index": session.order_index,
                "exercises": [
                    {
                        "order_index": exercise.order_index,
                        "exercise_id": exercise.exercise_id,
                        "increment_kg": exercise.increment_kg,
                        "uses_bodyweight": exercise.uses_bodyweight,
                        "body_weight_kg": exercise.body_weight_kg,
                        "sets": [
                            {
                                "set_index": s.set_index,
                                "set_type": s.set_type.name,
                                "target_weight_kg": s.target_weight_kg,
                                "target_reps": s.target_reps,
                                "target_min_reps": s.target_min_reps,
                                "target_max_reps": s.target_max_reps,
                                "target_rir": s.target_rir,
                                "was_clamped": s.was_clamped,
                                "origin": s.origin.name,
                                "is_pinned": s.is_pinned,
                            }
                            for s in exercise.sets
                        ],
                    }
                    for exercise in session.exercises
                ],
            }
            for session in cycle.sessions
        ],
    }


def _without_rules(cycles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            **cycle,
            "sessions": [
                {
                    **session,
                    "exercises": [
                        {key: value for key, value in exercise.items() if key != "rule"}
                        for exercise in session["exercises"]
                    ],
                }
                for session in cycle["sessions"]
            ],
        }
        for cycle in cycles
    ]


RECONCILE = load_fixture("reconcile")["cases"]


@pytest.mark.parametrize("case", RECONCILE, ids=[case["name"] for case in RECONCILE])
def test_every_reconcile_case_agrees(case: dict[str, Any]) -> None:
    today = epoch_day(date.fromisoformat(case["today"]))
    logs = _logs(case["logs"])
    reconciled = reconcile(_mesocycle(case["mesocycle"]), _plan(case["plan"]), logs, today)

    assert [_cycle_as_fixture(it) for it in reconciled.cycles] == _without_rules(
        case["expected"]["cycles"]
    )
    assert [
        {
            "cycle_number": it.cycle_number,
            "exercise_id": it.exercise_id,
            "occurrence": it.occurrence,
            "outcome": it.outcome.name,
            "open_loop": it.open_loop,
        }
        for it in reconciled.outcomes
    ] == case["expected"]["outcomes"]

    # INV-10, through the binding: once more on its own output changes nothing.
    again = reconcile(_mesocycle(case["mesocycle"]), reconciled.cycles, logs, today)
    assert [_cycle_as_fixture(it) for it in again.cycles] == [
        _cycle_as_fixture(it) for it in reconciled.cycles
    ]


def test_classify_reads_the_table_through_the_binding() -> None:
    planned = [PlanSet(set_index=0, set_type=SetType.Working, target_reps=6, target_rir=3)]

    def logged(reps: int, rir: int | None) -> list[PlanLog]:
        return [
            PlanLog(
                cycle_number=1,
                day_index=1,
                session_order_index=0,
                exercise_order_index=0,
                set_index=0,
                set=LoggedSet(
                    set_type=SetType.Working, is_completed=True, weight_kg=40.0, reps=reps, rir=rir
                ),
            )
        ]

    assert classify(planned, []) == Outcome.Missed
    assert classify(planned, logged(6, 3)) == Outcome.Met
    assert classify(planned, logged(6, 5)) == Outcome.Exceeded
    assert classify(planned, logged(5, 3)) == Outcome.Under
    assert classify(planned, logged(6, None)) == Outcome.Met


def test_an_unknown_failure_policy_is_refused() -> None:
    with pytest.raises(ValueError, match="unknown failure_policy"):
        ProgressionRule(ProgressionStrategy.Fixed, min_reps=5, max_reps=5, failure_policy="deload")


# ── block edits (stage 3b) ────────────────────────────────────────────────────────────────────────

EDITS = load_fixture("edits")["cases"]


def _edit(case: dict[str, Any]) -> dict[str, Any]:
    """Run one edit through the binding and describe what came back in the fixture's own terms."""
    mesocycle = _mesocycle(case["mesocycle"])
    plan = _plan(case["plan"])
    logs = _logs(case["logs"])
    today = epoch_day(date.fromisoformat(case["today"]))
    args = case["args"]
    try:
        if case["op"] == "extend":
            return {"cycles": extend(mesocycle, plan, logs, today, args["to"])}
        if case["op"] == "shorten":
            shortened = shorten(plan, logs, args["to"])
            return {"cycles": shortened.cycles, "dropped": shortened.dropped}
        if case["op"] == "settle_statuses":
            return {"cycles": settle_statuses(plan, logs, today)}
        if case["op"] == "relength":
            return {"cycles": relength(plan, logs, args["cycle_number"], args["days"])}
        switched = switch_rule(
            mesocycle,
            plan,
            logs,
            today,
            args["exercise_id"],
            args["occurrence"],
            args["from_cycle"],
            _rule(args["rule"]),
        )
        return {"cycles": switched.cycles, "outcomes": switched.outcomes}
    except PlanRefused as refused:
        reason, cycle_number, day_index = refused.args
        return {"refusal": {"reason": reason, "cycle_number": cycle_number, "day_index": day_index}}


@pytest.mark.parametrize("case", EDITS, ids=[case["name"] for case in EDITS])
def test_every_edit_case_agrees(case: dict[str, Any]) -> None:
    got = _edit(case)
    expected = case["expected"]
    if "refusal" in expected:
        assert got == {"refusal": expected["refusal"]}
        return

    assert "refusal" not in got, got
    assert [_cycle_as_fixture(it) for it in got["cycles"]] == _without_rules(expected["cycles"])
    assert got.get("dropped") == expected.get("dropped")
    if "outcomes" in expected:
        assert [
            {
                "cycle_number": it.cycle_number,
                "exercise_id": it.exercise_id,
                "occurrence": it.occurrence,
                "outcome": it.outcome.name,
                "open_loop": it.open_loop,
            }
            for it in got["outcomes"]
        ] == expected["outcomes"]


def test_a_refusal_is_a_value_error_carrying_its_reason() -> None:
    # A router catches `ValueError` today and can narrow to `PlanRefused` for its 409.
    assert issubclass(PlanRefused, ValueError)
