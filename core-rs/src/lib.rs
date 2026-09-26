//! The CyberAthlete domain core — [ADR-004](../../docs/decisions/ADR-004.md).
//!
//! One implementation of the logic the phone and the server must agree on exactly, compiled for
//! both: PyO3 into FastAPI, UniFFI into the Expo app. The boundary rule is *if it does I/O, it is
//! not in here* — plain data in, plain data out.
//!
//! INV-10: pure, deterministic and idempotent. No I/O, no clock, no randomness. "Now" is always a
//! parameter. `deny.toml` keeps the crates out and `clippy.toml` keeps the standard-library calls
//! out; an import rule alone would see the first and miss the second.
//!
//! The spike is over and ADR-004 answered option B, so the modules 02 §2 names arrive with the
//! tasks that need them. `strength` is the first, built by
//! [task 004](../../docs/tasks/004-exercise-catalog-and-logging.md); `gps`, `codec` and `zones`
//! follow with tasks 005 and 007.

#![forbid(unsafe_code)]

pub mod progression;
pub mod strength;

pub use progression::{
    CycleOneSet, CycleStatus, DeloadPolicy, ENGINE_VERSION, EpochDay, ExerciseSpec, FailurePolicy,
    LengthOverride, LoadStep, MesocycleSpec, Outcome, PlanCycle, PlanExercise, PlanLog,
    PlanSession, PlanSet, PlannedExercise, PlannedMicrocycle, PlannedSession, PlannedSet,
    Reconciled, RirMode, RoundingMode, Rule, SessionSpec, SetOrigin, SlotOutcome, Strategy,
    WriteKind, classify, generate, reconcile, resolve_dates, round_to_increment,
};
pub use strength::{
    LoggedSet, MAX_EFFECTIVE_REPS, PersonalBests, PrAchievement, PrKind, RepsAtWeight,
    SessionMetrics, SetEntry, SetField, SetType, StandingRecord, Tracking, counted_set_count,
    detect_prs, e1rm, e1rm_series, is_counted_set, is_counted_type, load_kg,
    missing_for_completion, personal_bests, session_metrics, standing_records, volume_kg,
};
