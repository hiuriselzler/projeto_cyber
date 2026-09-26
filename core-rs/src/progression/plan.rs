//! The plan's shape: what [`generate`](super::generate) reads, and the rows it writes.
//!
//! Plain records shaped like the rows of 03 §5, one level each (task 005, stage 1, decision 5), so a
//! fixture reads as the plan it describes and each binding is a thin mapper. Every record carries its
//! **natural key** — its place in the plan — and no id ([ADR-002](../../../docs/decisions/ADR-002.md)
//! § Amendment 2026-09-26):
//!
//! | Row | Natural key |
//! |---|---|
//! | microcycle | `cycle_number` |
//! | session | `(day_index, order_index)` within its cycle |
//! | exercise | `order_index` within its session |
//! | set | `set_index` within its exercise |
//!
//! **Nothing subjective is here.** `perceived_fatigue` never reaches the engine, and a strategy that
//! wanted it would have to widen this surface to get it — a visible change, not a quiet one (INV-03).

use super::RoundingMode;
use super::dates::EpochDay;
use crate::strength::SetType;

/// The most microcycles a block may hold (FR-3.1).
pub const MAX_MICROCYCLES: u32 = 52;

/// How a `linear_load` rule advances: a fixed load, or a share of cycle 1's load (01 §3.2 (a)).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LoadStep {
    /// `progression_rules.load_step_kg` — kilograms added each working cycle.
    Kg(f64),
    /// `progression_rules.load_step_bp` — basis points of **cycle 1's** load added each working cycle;
    /// 250 is 2.5 % (ADR-010 §3). Of cycle 1's load, not the last cycle's, so it adds a constant amount
    /// and never compounds.
    BasisPoints(u32),
}

/// Which progression strategy a rule applies (01 §3.2). Stage 1 builds two of the five v1 strategies;
/// `double_progression`, `percent_1rm` and `rir_autoregulated` arrive in stage 2, and `cycle_pattern`
/// is v2.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Strategy {
    /// FR-3.5: never change anything. For accessories and rehab work.
    Fixed,
    /// 01 §3.2 (a): the same sets × reps, a step more load each working cycle.
    LinearLoad(LoadStep),
}

/// One exercise's progression rule, already resolved through FR-3.6's cascade — exercise, then
/// mesocycle default, then user default. The cascade is table lookups, so it is the wrapper's job.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rule {
    pub strategy: Strategy,
    /// INV-05: no generated set may prescribe fewer reps than this…
    pub min_reps: u32,
    /// …or more than this.
    pub max_reps: u32,
    /// INV-05: the same guarantee for target RIR.
    pub min_rir: u32,
    pub max_rir: u32,
    /// How a working load is rounded onto the plate grid (INV-02, ADR-010 § Amendment).
    pub rounding: RoundingMode,
}

/// The deload policy, one of FR-3.1b's three modes. `None` is a real choice, not a missing setting.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeloadPolicy {
    /// No cycle is ever a deload, and nothing suggests one (FR-3.1b).
    None,
    /// Every `every`-th cycle is a deload; with `final_cycle`, the last cycle is one too when `every`
    /// does not already land on it (01 FR-3.9).
    EveryN { every: u32, final_cycle: bool },
    /// Exactly the cycles the user flagged, by `cycle_number`.
    Manual { cycles: Vec<u32> },
}

/// A cycle whose length differs from the mesocycle's default (FR-3.1a) — a 5-day travel cycle in a
/// block of 7s, or a deload given a length of its own.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LengthOverride {
    pub cycle_number: u32,
    pub length_days: u32,
}

/// The mesocycle, as generation reads it: the `mesocycles` row, plus the cycle lengths the user
/// changed from its default.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MesocycleSpec {
    /// `mesocycles.start_date`, as days since 1970-01-01.
    pub start_day: EpochDay,
    /// 2–52 (FR-3.1).
    pub num_microcycles: u32,
    /// 1–28, and 7 only because the user left it there (INV-25).
    pub default_length_days: u32,
    /// Where one cycle's length differs from the default. If a cycle is named twice, the last wins.
    pub length_overrides: Vec<LengthOverride>,
    pub deload: DeloadPolicy,
    /// The share of a deload cycle's working sets kept, in basis points (default 5000).
    pub deload_set_bp: u32,
    /// The share of the last working load a deload prescribes, in basis points (default 6000).
    pub deload_load_bp: u32,
    /// How far a deload raises target RIR (default 2), before clamping into the rule (INV-05).
    pub deload_rir_bump: u32,
}

/// One set of cycle 1, exactly as the user authored it (FR-3.3). The baseline every later cycle is
/// generated from.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CycleOneSet {
    pub set_index: u32,
    pub set_type: SetType,
    /// Kilograms, total — or added load for a bodyweight exercise. `None` for an exercise with no load.
    pub target_weight_kg: Option<f64>,
    pub target_reps: Option<u32>,
    /// `None` is "no RIR target", never 0 (INV-03).
    pub target_rir: Option<u32>,
}

/// One exercise of cycle 1, with what the engine needs already resolved by the wrapper.
#[derive(Debug, Clone, PartialEq)]
pub struct ExerciseSpec {
    pub order_index: u32,
    /// INV-02's increment for this exercise **in the user's unit system**, in exact kilograms: the
    /// exercise override, else the modality default, else 2.5 kg / 5 lb. Resolving it reads tables, so
    /// the wrapper does it (task 005, stage 1, decision 4).
    pub increment_kg: f64,
    pub rule: Rule,
    pub sets: Vec<CycleOneSet>,
}

/// One session of cycle 1: where it falls in the cycle, and what it holds.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionSpec {
    /// 1..cycle length, never a weekday (INV-25).
    pub day_index: u32,
    /// Orders two sessions on the same day.
    pub order_index: u32,
    pub exercises: Vec<ExerciseSpec>,
}

/// A generated `planned_sets` row. Origin `generated`, not pinned.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PlannedSet {
    pub set_index: u32,
    pub set_type: SetType,
    /// Always an exact multiple of the exercise's increment (INV-02).
    pub target_weight_kg: Option<f64>,
    /// Always inside the rule's rep bounds (INV-05).
    pub target_reps: Option<u32>,
    /// Always inside the rule's RIR bounds (INV-05).
    pub target_rir: Option<u32>,
    /// The engine bent a target to fit its rule: a deload's raised RIR, or a target carried from cycle 1
    /// outside the rule's bounds, clamped into them (03 §5, INV-05).
    pub was_clamped: bool,
}

/// A generated `planned_exercises` row.
#[derive(Debug, Clone, PartialEq)]
pub struct PlannedExercise {
    pub order_index: u32,
    pub sets: Vec<PlannedSet>,
}

/// A generated `planned_sessions` row.
#[derive(Debug, Clone, PartialEq)]
pub struct PlannedSession {
    /// Always within its own cycle's `length_days` (INV-25).
    pub day_index: u32,
    pub order_index: u32,
    pub exercises: Vec<PlannedExercise>,
}

/// A generated `microcycles` row, status `projected` and `last_write_kind = 'engine'`.
#[derive(Debug, Clone, PartialEq)]
pub struct PlannedMicrocycle {
    pub cycle_number: u32,
    pub length_days: u32,
    /// Exactly the previous cycle's start plus its length (03 §5).
    pub starts_on: EpochDay,
    pub is_deload: bool,
    /// The engine that projected it — always [`ENGINE_VERSION`](super::ENGINE_VERSION) (INV-06).
    pub engine_version: u32,
    pub sessions: Vec<PlannedSession>,
}
