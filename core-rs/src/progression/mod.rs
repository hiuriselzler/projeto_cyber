//! Progression: the plan's shape, its dates, the strategies, and the load rounding every one of them
//! ends in — [task 005](../../../docs/tasks/005-strength-progression-planner.md).
//!
//! Stages 1 and 2 build [`generate`] for the five v1 strategies, the three deload policies, the per-set
//! RIR ladder and [`resolve_dates`]; stage 3a builds [`classify`] and [`reconcile`], which re-projects a
//! plan from what was logged; stage 3b builds the block edits — [`extend`], [`shorten`], [`relength`] and
//! [`switch_rule`].
//! [switch_rule].
//!
//! **What this module does not know, deliberately.** No ids: the engine names a row by its place in the
//! plan and the wrappers mint the UUIDv7s ([ADR-002](../../../docs/decisions/ADR-002.md) § Amendment
//! 2026-09-26). No units and no modalities: each exercise arrives with its increment already resolved,
//! in kilograms (INV-01, INV-02). No calendar: a date is a count of days (see [`resolve_dates`]).

mod classify;
mod dates;
mod deload;
mod edits;
mod generate;
mod plan;
mod reconcile;
mod rounding;
mod status;
mod strategies;

pub use classify::classify;
pub use dates::{EpochDay, MAX_LENGTH_DAYS, MIN_LENGTH_DAYS, resolve_dates};
pub use deload::deload_schedule;
pub use edits::{Refusal, RefusalReason, Shortened, extend, relength, shorten, switch_rule};
pub use generate::generate;
pub use plan::{
    CycleOneSet, CycleStatus, DeloadPolicy, ExerciseSpec, FailurePolicy, LengthOverride, LoadStep,
    MAX_MICROCYCLES, MesocycleSpec, Outcome, PlanCycle, PlanExercise, PlanLog, PlanSession,
    PlanSet, PlannedExercise, PlannedMicrocycle, PlannedSession, PlannedSet, Reconciled, RirMode,
    Rule, SessionSpec, SetOrigin, SlotOutcome, Strategy, WriteKind,
};
pub use reconcile::reconcile;
pub use rounding::{RoundingMode, round_to_increment};
pub use status::settle_statuses;

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
