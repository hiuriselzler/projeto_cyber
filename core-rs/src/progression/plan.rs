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
use crate::strength::{LoggedSet, SetType};

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

/// Which progression strategy a rule applies — the five v1 strategies of 01 §3.2. `cycle_pattern` is
/// v2, and absent rather than half-built.
///
/// Each variant carries exactly what it needs, so a rule missing its step, its wave or its baseline
/// cannot be expressed here; the wrappers refuse to build one. Generation is **open-loop**: with no logs
/// yet, each strategy projects as if every working cycle were `Met` (01 §3.4). What logged performance
/// changes is `reconcile`'s.
#[derive(Debug, Clone, PartialEq)]
pub enum Strategy {
    /// FR-3.5: never change anything. For accessories and rehab work.
    Fixed,
    /// 01 §3.2 (a): the same sets × reps, a step more load each working cycle.
    LinearLoad(LoadStep),
    /// 01 §3.2 (b): hold the load and add reps up the rule's range; at the top, a step more load and back
    /// to the bottom. The exercise moves as one (01 §3.2, task 005 stage 2).
    DoubleProgression {
        step: LoadStep,
        /// `progression_rules.rep_step` — reps added a cycle, stopping at the top of the range.
        rep_step: u32,
    },
    /// 01 §3.2 (c): each working cycle's counted sets at a share of the e1RM, following a wave.
    Percent1rm {
        /// `progression_rules.percent_wave_bp` — tiled across the working cycles, cycle 1 first.
        wave_bp: Vec<u32>,
        /// The reference e1RM, so generation is total with no e1RM in history (FR-3.2c, INV-07). For a
        /// bodyweight exercise it is body weight plus added load, as every e1RM is (ADR-010 §1).
        baseline_e1rm_kg: f64,
    },
    /// 01 §3.2 (d): the load climbs a step each working cycle while the target RIR descends from
    /// `rir_start` to `rir_end`. How big the step is after a logged cycle is `reconcile`'s (§3.4).
    RirAutoregulated {
        step: LoadStep,
        /// RIR at cycle 1. With none, cycle 1's own RIRs are held.
        rir_start: Option<u32>,
        /// RIR at the last working cycle. With none, the target holds at `rir_start`.
        rir_end: Option<u32>,
    },
}

/// FR-3.8a: whether a rule sets one target RIR for the whole exercise, or a ladder of them.
///
/// Authoring only — `planned_sets.target_rir` exists per set either way. The engine applies the ladder
/// where a strategy moves the exercise's target, which in v1 is `rir_autoregulated`; the other strategies
/// hold RIR still, so cycle 1's per-set RIRs, which already hold the ladder as the user wrote it, are
/// kept (task 005 stage 2, decision 5).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RirMode {
    PerExercise,
    /// `progression_rules.rir_offsets` — an offset per counted set, in `set_index` order. A set past the
    /// end of the ladder takes 0; an offset may be negative. Every sum is clamped into the rule and marked
    /// (INV-05, ADR-010 §2).
    PerSet {
        offsets: Vec<i32>,
    },
}

/// One exercise's progression rule, already resolved through FR-3.6's cascade — exercise, then
/// mesocycle default, then user default. The cascade is table lookups, so it is the wrapper's job.
#[derive(Debug, Clone, PartialEq)]
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
    pub rir_mode: RirMode,
    /// FR-3.11: what an `Under` outcome does to the next working cycle. Read by `reconcile` only.
    pub failure_policy: FailurePolicy,
}

/// FR-3.11 — what reconciliation does after an `Under` outcome (task 005 stage 3, decision 4).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailurePolicy {
    /// Repeat the prescription.
    Hold,
    /// Repeat the failed cycle's prescriptions for **every** exercise in it, in the next working cycle.
    /// No cycle is inserted, so the block keeps its length and its end date.
    RepeatCycle,
    /// Repeat the prescription at `load_bp` of its load (`failure_load_bp`, default 9000).
    ReduceLoad { load_bp: u32 },
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
    /// `exercises.uses_bodyweight` — whether the lifter is part of the load, so a set's weight is the
    /// *added* load (INV-07).
    pub uses_bodyweight: bool,
    /// The latest body weight, for `percent_1rm` on a bodyweight exercise: its e1RM is over body weight
    /// plus added load, and a planned set prescribes the added part. `None` if none was ever logged, and
    /// then the engine does not guess (INV-07).
    pub body_weight_kg: Option<f64>,
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
    /// The rep range a double-progression set is shown against (03 §5); `None` for every other strategy.
    pub target_min_reps: Option<u32>,
    pub target_max_reps: Option<u32>,
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

// ── The plan as `reconcile` reads and writes it (stage 3a) ───────────────────────────────────────
//
// The rows of 03 §5 with everything the guard needs: a cycle's status, the engine that last projected
// it and who last wrote it, and each set's origin and pin. Each exercise carries its rule, increment and
// body weight as generation's do, plus its `exercise_id` — an opaque reference to the catalog, compared
// and never interpreted, so the engine can tell "the same exercise" across cycles (stage 3, decision 2).

/// `cycle_status_enum` — INV-06 lives here: the engine rewrites `Projected` cycles only.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CycleStatus {
    Projected,
    /// Pinned by the user; the engine never rewrites it.
    Locked,
    InProgress,
    Completed,
    Skipped,
}

/// `write_kind_enum` — who last changed a microcycle (02 §7).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WriteKind {
    Engine,
    User,
}

/// `set_origin_enum` — whether a planned set is the engine's or the user's (FR-3.14).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SetOrigin {
    Generated,
    UserEdited,
}

macro_rules! named {
    ($kind:ident { $($variant:ident => $name:literal),+ $(,)? }) => {
        impl $kind {
            /// The name this value carries in the schema, the shared fixtures and both bindings.
            #[must_use]
            pub fn from_name(name: &str) -> Option<Self> {
                match name {
                    $($name => Some(Self::$variant),)+
                    _ => None,
                }
            }

            /// The inverse of `from_name`.
            #[must_use]
            pub const fn name(self) -> &'static str {
                match self {
                    $(Self::$variant => $name,)+
                }
            }
        }
    };
}

named!(CycleStatus {
    Projected => "projected",
    Locked => "locked",
    InProgress => "in_progress",
    Completed => "completed",
    Skipped => "skipped",
});
named!(WriteKind { Engine => "engine", User => "user" });
named!(SetOrigin { Generated => "generated", UserEdited => "user_edited" });

/// A `planned_sets` row.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PlanSet {
    pub set_index: u32,
    pub set_type: SetType,
    pub target_weight_kg: Option<f64>,
    pub target_reps: Option<u32>,
    pub target_min_reps: Option<u32>,
    pub target_max_reps: Option<u32>,
    pub target_rir: Option<u32>,
    pub was_clamped: bool,
    pub origin: SetOrigin,
    /// FR-3.14: the engine never touches a pinned set.
    pub is_pinned: bool,
}

impl PlanSet {
    /// The user owns this row: the engine keeps it exactly, and projects later cycles from it.
    #[must_use]
    pub const fn is_users(&self) -> bool {
        matches!(self.origin, SetOrigin::UserEdited) || self.is_pinned
    }
}

/// A `planned_exercises` row, with what the engine reads already resolved by the wrapper.
#[derive(Debug, Clone, PartialEq)]
pub struct PlanExercise {
    pub order_index: u32,
    /// `planned_exercises.exercise_id`, opaque: two exercises are the same when these are equal.
    pub exercise_id: String,
    pub increment_kg: f64,
    /// The rule on this cycle's row — so a strategy switched mid-block applies from the cycle it is on.
    pub rule: Rule,
    pub uses_bodyweight: bool,
    pub body_weight_kg: Option<f64>,
    pub sets: Vec<PlanSet>,
}

/// A `planned_sessions` row.
#[derive(Debug, Clone, PartialEq)]
pub struct PlanSession {
    pub day_index: u32,
    pub order_index: u32,
    pub exercises: Vec<PlanExercise>,
}

/// A `microcycles` row.
#[derive(Debug, Clone, PartialEq)]
pub struct PlanCycle {
    pub cycle_number: u32,
    pub length_days: u32,
    pub starts_on: EpochDay,
    pub is_deload: bool,
    pub status: CycleStatus,
    pub engine_version: u32,
    pub last_write_kind: WriteKind,
    pub sessions: Vec<PlanSession>,
}

/// One logged set, placed on the planned set it was logged against (FR-3.15): the wrapper follows
/// `set_logs.planned_set_id` to the planned row and passes its natural key. A set logged against no
/// planned set is a deviation — recorded, never read here (FR-3.16).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PlanLog {
    pub cycle_number: u32,
    /// The planned session's `(day_index, order_index)`.
    pub day_index: u32,
    pub session_order_index: u32,
    /// The planned exercise's `order_index` within that session.
    pub exercise_order_index: u32,
    pub set_index: u32,
    /// Task 004's logged set, with body weight on its date already resolved (INV-07).
    pub set: LoggedSet,
}

/// 01 §3.4 — how a planned exercise went.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// Every counted set met its target, each at least two reps in reserve above it.
    Exceeded,
    /// Every counted set met its target.
    Met,
    /// A counted set fell short, or went to failure when the target left two in reserve.
    Under,
    /// Its session's day has passed, and nothing in the session was logged.
    Missed,
}

named!(Outcome {
    Exceeded => "exceeded",
    Met => "met",
    Under => "under",
    Missed => "missed",
});

/// An outcome `reconcile` acted on — what stage 8's after-session diff and FR-3.12's suggestion read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SlotOutcome {
    pub cycle_number: u32,
    pub exercise_id: String,
    /// Which occurrence of the exercise in its cycle, in canonical order — squat on day 1 is 0.
    pub occurrence: u32,
    pub outcome: Outcome,
    /// `percent_1rm` found no e1RM in the session and held the last one (FR-3.2c, INV-07).
    pub open_loop: bool,
}

/// What `reconcile` returns: the whole plan, and the outcomes it acted on.
#[derive(Debug, Clone, PartialEq)]
pub struct Reconciled {
    pub cycles: Vec<PlanCycle>,
    pub outcomes: Vec<SlotOutcome>,
}
