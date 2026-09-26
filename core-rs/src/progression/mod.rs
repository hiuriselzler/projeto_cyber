//! Progression: the plan's shape, its dates, the strategies, and the load rounding every one of them
//! ends in — [task 005](../../../docs/tasks/005-strength-progression-planner.md).
//!
//! Stage 1 builds the foundation: [`generate`] for `linear_load` and `fixed`, the three deload policies,
//! and [`resolve_dates`]. The other three v1 strategies arrive in stage 2, and `classify` and
//! `reconcile` in stage 3.
//!
//! **What this module does not know, deliberately.** No ids: the engine names a row by its place in the
//! plan and the wrappers mint the UUIDv7s ([ADR-002](../../../docs/decisions/ADR-002.md) § Amendment
//! 2026-09-26). No units and no modalities: each exercise arrives with its increment already resolved,
//! in kilograms (INV-01, INV-02). No calendar: a date is a count of days (see [`resolve_dates`]).

mod dates;
mod deload;
mod generate;
mod plan;
mod rounding;

pub use dates::{EpochDay, MAX_LENGTH_DAYS, MIN_LENGTH_DAYS, resolve_dates};
pub use deload::deload_schedule;
pub use generate::generate;
pub use plan::{
    CycleOneSet, DeloadPolicy, ExerciseSpec, LengthOverride, LoadStep, MAX_MICROCYCLES,
    MesocycleSpec, PlannedExercise, PlannedMicrocycle, PlannedSession, PlannedSet, Rule,
    SessionSpec, Strategy,
};
pub use rounding::{RoundingMode, round_to_increment};

/// The version of the engine that stamps every microcycle it projects (INV-06,
/// [ADR-004](../../../docs/decisions/ADR-004.md)).
///
/// **It changes whenever any shared fixture's expected output changes, and at no other time.** A
/// refactor that alters no projection leaves it alone; a behavioural change with no fixture proving it
/// is a missing fixture. Adding a fixture for behaviour that did not exist before — a new strategy —
/// changes no existing output and does not bump it.
pub const ENGINE_VERSION: u32 = 1;

/// One hundred per cent, in the basis points every percentage in the plan is written in (ADR-010 §3).
pub const BASIS_POINTS: u32 = 10_000;
