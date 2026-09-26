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
  each row it creates (ADR-002 § Amendment 2026-09-26).

**Dates cross the core as whole days since 1970-01-01** (task 005, stage 1, decision 6). The two
helpers below are the only conversion, so a date is never an off-by-one between two call sites.
"""

from datetime import date, timedelta

from cyberathlete_core import (
    ENGINE_VERSION,
    CycleOneSet,
    ExerciseSpec,
    MesocycleSpec,
    PlannedExercise,
    PlannedMicrocycle,
    PlannedSession,
    PlannedSet,
    ProgressionRule,
    ProgressionStrategy,
    SessionSpec,
    generate,
    resolve_dates,
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
    "ExerciseSpec",
    "MesocycleSpec",
    "PlannedExercise",
    "PlannedMicrocycle",
    "PlannedSession",
    "PlannedSet",
    "ProgressionRule",
    "ProgressionStrategy",
    "SessionSpec",
    "epoch_day",
    "from_epoch_day",
    "generate",
    "resolve_dates",
]
