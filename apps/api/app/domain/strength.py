"""INV-04 and INV-07 — the one place the server counts a set or estimates a one-rep max.

Like `rounding.py` beside it, this module is deliberately almost empty: it re-exports the Rust core
reached through PyO3 (ADR-004 § Outcome), so that a total on a server-rendered export and the same
total on the phone are the same arithmetic rather than two implementations that agree until they do
not (INV-10).

Import these from here, never `cyberathlete_core` directly — the fence in `.importlinter` enforces
it. The reason is the one INV-04 gives: a `WHERE set_type IN (...)` in a repository is the counting
rule written a second time, and the second copy is the one that gets missed when a set type is
added.

**What the caller still owes the core.** `LoggedSet` carries `body_weight_kg` and `is_deload`
already resolved, because resolving either is a query and the core does no I/O. Body weight is the
latest `body_weight_log` entry **on or before the set's `local_date`** — never today's, or every
historical pull-up's e1RM would move each time the user weighed in (INV-07, INV-17).
"""

from cyberathlete_core import (
    LoggedSet,
    PersonalBests,
    PrAchievement,
    PrKind,
    RepsAtWeight,
    SetType,
    counted_set_count,
    detect_prs,
    e1rm,
    e1rm_series,
    is_counted_set,
    load_kg,
    personal_bests,
    volume_kg,
)

__all__ = [
    "LoggedSet",
    "PersonalBests",
    "PrAchievement",
    "PrKind",
    "RepsAtWeight",
    "SetType",
    "counted_set_count",
    "detect_prs",
    "e1rm",
    "e1rm_series",
    "is_counted_set",
    "load_kg",
    "personal_bests",
    "volume_kg",
]
