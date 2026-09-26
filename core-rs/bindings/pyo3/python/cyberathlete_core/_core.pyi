"""Types for the compiled module, so the API's `mypy --strict` sees the core as typed.

Kept beside `src/lib.rs` deliberately: a signature changed there and not here is a type error in the
API, which is the earliest place the mismatch can be caught.

`RoundingMode` is declared as a plain class with class-level members, not as an `enum.Enum`: a PyO3
`#[pyclass]` enum is its own type and does not inherit from Python's `Enum`, and a stub that claimed
otherwise would type-check code that fails at runtime.
"""

class RoundingMode:
    """Which way a load between two steps is moved (INV-02, ADR-010 § Amendment)."""

    Nearest: RoundingMode
    Down: RoundingMode
    Up: RoundingMode

    @staticmethod
    def from_name(name: str) -> RoundingMode:
        """The mode's name in the shared fixtures. Raises `ValueError` for anything else."""

    @property
    def name(self) -> str:
        """The inverse of `from_name`."""

def round_to_increment(weight_kg: float, increment_kg: float, mode: RoundingMode) -> float:
    """Round a load to an exact multiple of an increment (INV-02)."""

def core_version() -> str:
    """The version of the core crate this module was built from. Not `ENGINE_VERSION`."""

# ── Strength (task 004) ──────────────────────────────────────────────────────────────────────────

class SetType:
    """How a set was performed — the schema's `set_type_enum` (03 §4)."""

    Warmup: SetType
    Working: SetType
    Drop: SetType
    Backoff: SetType
    Amrap: SetType

    @staticmethod
    def from_name(name: str) -> SetType:
        """The type's name in the database. Raises `ValueError` for anything else."""

    @property
    def name(self) -> str:
        """The inverse of `from_name`."""

class LoggedSet:
    """One logged set, with everything the core needs already resolved.

    `body_weight_kg` is the latest body weight **on or before this set's date** and `is_deload` is
    its microcycle's flag. Both are queries, so both are the caller's job — the core does no I/O
    (INV-10). `rir=None` means "not recorded" and is never read as 0 (INV-03).
    """

    def __init__(
        self,
        set_type: SetType,
        is_completed: bool,
        weight_kg: float | None = None,
        reps: int | None = None,
        rir: int | None = None,
        uses_bodyweight: bool = False,
        body_weight_kg: float | None = None,
        is_deload: bool = False,
    ) -> None: ...
    @property
    def set_type(self) -> SetType: ...
    @property
    def is_completed(self) -> bool: ...
    @property
    def weight_kg(self) -> float | None: ...
    @property
    def reps(self) -> int | None: ...
    @property
    def rir(self) -> int | None: ...
    @property
    def uses_bodyweight(self) -> bool: ...
    @property
    def body_weight_kg(self) -> float | None: ...
    @property
    def is_deload(self) -> bool: ...

class PrKind:
    """Which record was broken — the schema's `pr_kind_enum` (03 §4)."""

    MaxWeight: PrKind
    BestE1rm: PrKind
    MaxRepsAtWeight: PrKind
    BestSessionVolume: PrKind

    @property
    def name(self) -> str:
        """The kind's name in the database and the shared fixtures."""

class RepsAtWeight:
    """The most reps ever done at one exact load."""

    def __init__(self, weight_kg: float, reps: int) -> None: ...
    @property
    def weight_kg(self) -> float: ...
    @property
    def reps(self) -> int: ...

class PersonalBests:
    """What an exercise's records stood at before the session being judged.

    Every field is optional because a first-ever session has no previous anything, and that case
    must produce records rather than fail.
    """

    def __init__(
        self,
        max_weight_kg: float | None = None,
        best_e1rm_kg: float | None = None,
        best_session_volume_kg: float | None = None,
        best_reps_at_weight: list[RepsAtWeight] = ...,
    ) -> None: ...
    @property
    def max_weight_kg(self) -> float | None: ...
    @property
    def best_e1rm_kg(self) -> float | None: ...
    @property
    def best_session_volume_kg(self) -> float | None: ...
    @property
    def best_reps_at_weight(self) -> list[RepsAtWeight]: ...

class PrAchievement:
    """One record broken in the session just finished."""

    @property
    def kind(self) -> PrKind: ...
    @property
    def value(self) -> float: ...
    @property
    def weight_kg(self) -> float | None: ...
    @property
    def reps(self) -> int | None: ...
    @property
    def rir(self) -> int | None: ...
    @property
    def set_index(self) -> int | None: ...

def is_counted_set(set: LoggedSet) -> bool:
    """Whether a set counts toward volume, PRs and set counts (INV-04)."""

def load_kg(set: LoggedSet) -> float | None:
    """The load a set moved, including the lifter for a bodyweight exercise (INV-07)."""

def e1rm(set: LoggedSet) -> float | None:
    """The estimated one-rep max, or `None` where INV-07 refuses to guess."""

def e1rm_series(sets: list[LoggedSet]) -> list[float | None]:
    """`e1rm` over many sets at once, order and length preserved."""

def volume_kg(sets: list[LoggedSet]) -> float:
    """Total tonnage of the counted sets, in kilograms (INV-04)."""

def counted_set_count(sets: list[LoggedSet]) -> int:
    """How many of these sets counted (INV-04)."""

def detect_prs(previous: PersonalBests, session: list[LoggedSet]) -> list[PrAchievement]:
    """Every record the session broke, in a fixed order (FR-2.15, INV-04, INV-08)."""

def personal_bests(sessions: list[list[LoggedSet]]) -> PersonalBests:
    """An exercise's bests after a history of sessions, one workout's sets per session."""

class StandingRecord:
    """A record still standing after a history, and the session that set it (task 004 stage 7).

    `record.set_index` is a position within the session at `session_index` — the earliest session to
    reach the value, since a later tie is not a record.
    """

    @property
    def record(self) -> PrAchievement: ...
    @property
    def session_index(self) -> int: ...

def standing_records(sessions: list[list[LoggedSet]]) -> list[StandingRecord]:
    """Every record standing after a history passed oldest first, with where each was set."""

class SessionMetrics:
    """One session of one exercise, reduced to what its history charts (task 004 stage 7).

    Each value is over the counted sets only (INV-04); `None` is "nothing to plot", never zero.
    """

    @property
    def top_load_kg(self) -> float | None: ...
    @property
    def best_e1rm_kg(self) -> float | None: ...
    @property
    def volume_kg(self) -> float | None: ...
    @property
    def counted_sets(self) -> int: ...

def session_metrics(sessions: list[list[LoggedSet]]) -> list[SessionMetrics]:
    """Per-session metrics over a whole history, in the order given."""

class Tracking:
    """How an exercise is logged — the schema's `tracking_enum` (03 §2, FR-2.3)."""

    WeightReps: Tracking
    RepsOnly: Tracking
    Duration: Tracking
    DistanceDuration: Tracking

    @staticmethod
    def from_name(name: str) -> Tracking:
        """The mode's name in the database. Raises `ValueError` for anything else."""

    @property
    def name(self) -> str:
        """The inverse of `from_name`."""

class SetEntry:
    """The measures a set row holds, as typed. `None` is nothing typed; 0 is a value."""

    def __init__(
        self,
        reps: int | None = None,
        duration_s: int | None = None,
        distance_m: float | None = None,
    ) -> None: ...
    @property
    def reps(self) -> int | None: ...
    @property
    def duration_s(self) -> int | None: ...
    @property
    def distance_m(self) -> float | None: ...

def missing_for_completion(tracking: Tracking, entry: SetEntry) -> str | None:
    """The `set_logs` column — `reps`, `duration_s` or `distance_m` — a set of this mode is
    missing before it can be completed, or `None` if it holds what the mode needs (03 §4)."""
