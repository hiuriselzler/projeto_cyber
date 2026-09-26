"""The progression engine on the server — task 005, through the Rust core (ADR-004 option B).

Like `rounding.py` and `strength.py` beside it, this module re-exports the core reached through
PyO3, so that a block generated here and the same block generated on the phone are the same
arithmetic (INV-10). Import it from here, never `cyberathlete_core` directly — the fence in
`.importlinter` says so.

**What the caller still owes the engine**, because each is a query and the core does no I/O:
- each exercise's **increment**, resolved as INV-02 says — exercise override, then the modality
  default for the user's unit system, then 2.5 kg / 5 lb — in exact kilograms;
- each exercise's **rule**, resolved through FR-3.6's cascade;
- the **ids**: the engine names rows by their place in the plan, and the caller mints a UUIDv7 for
  each row it creates (ADR-002 § Amendment 2026-09-26);
- for `reconcile`, **each logged set placed on its planned set** — `set_logs.planned_set_id`
  followed to the planned row's natural key — with body weight on the set's date resolved, and each
  planned exercise's `exercise_id`, which the engine compares and never reads.

**A block edit the engine refuses raises `PlanRefused`**, whose `args` are `(reason, cycle_number,
day_index)` — enough for a router to answer 409 with the reason (task 005 stage 3b).

**Dates cross the core as whole days since 1970-01-01** (task 005, stage 1, decision 6). The two
helpers below are the only conversion, so a date is never an off-by-one between two call sites.
"""

from datetime import date, timedelta

from cyberathlete_core import (
    ENGINE_VERSION,
    CycleOneSet,
    CycleStatus,
    ExerciseSpec,
    MesocycleSpec,
    Outcome,
    PlanCycle,
    PlanExercise,
    PlanLog,
    PlannedExercise,
    PlannedMicrocycle,
    PlannedSession,
    PlannedSet,
    PlanRefused,
    PlanSession,
    PlanSet,
    ProgressionRule,
    ProgressionStrategy,
    Reconciled,
    SessionSpec,
    SetOrigin,
    Shortened,
    SlotOutcome,
    WriteKind,
    classify,
    extend,
    generate,
    reconcile,
    relength,
    resolve_dates,
    settle_statuses,
    shorten,
    switch_rule,
)

_EPOCH = date(1970, 1, 1)


def epoch_day(day: date) -> int:
    """A date as the core reads one: whole days since 1970-01-01."""
    return (day - _EPOCH).days


def from_epoch_day(days: int) -> date:
    """The inverse of `epoch_day`."""
    return _EPOCH + timedelta(days=days)


__all__ = [
    "ENGINE_VERSION",
    "CycleOneSet",
    "CycleStatus",
    "ExerciseSpec",
    "MesocycleSpec",
    "Outcome",
    "PlanCycle",
    "PlanExercise",
    "PlanLog",
    "PlanRefused",
    "PlanSession",
    "PlanSet",
    "PlannedExercise",
    "PlannedMicrocycle",
    "PlannedSession",
    "PlannedSet",
    "ProgressionRule",
    "ProgressionStrategy",
    "Reconciled",
    "SessionSpec",
    "SetOrigin",
    "Shortened",
    "SlotOutcome",
    "WriteKind",
    "classify",
    "epoch_day",
    "extend",
    "from_epoch_day",
    "generate",
    "reconcile",
    "relength",
    "resolve_dates",
    "settle_statuses",
    "shorten",
    "switch_rule",
]
