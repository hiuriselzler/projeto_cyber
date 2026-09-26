//! The core, as a native module the Expo app loads — the client half of
//! [ADR-004](../../../../docs/decisions/ADR-004.md).
//!
//! Like the PyO3 crate beside it, this holds no logic: it declares the FFI surface and calls
//! [`cyberathlete_core`]. The generated TypeScript is a pnpm workspace package that only
//! `apps/mobile/src/domain/` may import ([ADR-012](../../../../docs/decisions/ADR-012.md)), which
//! is the rule that stops the core leaking into screens and sync code.
//!
//! Declared with UniFFI's procedural macros rather than a `.udl` file: the Rust signature is then
//! the single description of the boundary, and cannot drift from a hand-written interface file.

uniffi::setup_scaffolding!();

use cyberathlete_core::{
    CycleOneSet, CycleStatus, DeloadPolicy, ExerciseSpec, FailurePolicy, LengthOverride, LoadStep,
    LoggedSet, MesocycleSpec, Outcome, PlanCycle, PlanExercise, PlanLog, PlanSession, PlanSet,
    PlannedExercise, PlannedMicrocycle, PlannedSession, PlannedSet, Reconciled, Refusal, RirMode,
    RoundingMode, Rule, SessionSpec, SetOrigin, SetType, Shortened, SlotOutcome, Strategy,
    WriteKind,
};

// ── The core's own types, exposed as they are ─────────────────────────────────────────────────────
//
// `uniffi::remote` exposes a type the core defines, redeclared here field for field: nothing is copied
// into a mirror and back, so nothing can be dropped on the way, and a redeclaration that no longer
// matches the core fails to compile. Task 004 mirrored its types by hand; the three the planner shares
// with it — `RoundingMode`, `SetType`, `LoggedSet` — moved here in task 005 stage 4a, and their
// generated TypeScript is unchanged.

/// Which way a load between two steps is moved; a tie goes to the lighter load (ADR-010).
#[uniffi::remote(Enum)]
pub enum RoundingMode {
    Nearest,
    Down,
    Up,
}

/// Round a load to a multiple of an increment (INV-02).
#[uniffi::export]
pub fn round_to_increment(weight_kg: f64, increment_kg: f64, mode: RoundingMode) -> f64 {
    cyberathlete_core::round_to_increment(weight_kg, increment_kg, mode)
}

/// The version of the core this module was built from. **Not** `ENGINE_VERSION`, which stamps a
/// projection (INV-06) and arrives with task 005.
#[uniffi::export]
pub fn core_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

// ── Strength (task 004) ───────────────────────────────────────────────────────────────────────────
//
// Everything below is type marshalling. The batch shapes — `volumeKg`, `e1rmSeries`, `detectPrs`
// over a whole list — are here because on this side of the boundary each call is a JSI hop, and a
// set-logging screen or an e1RM chart would otherwise make one per row. The maths is in the core.

/// How a set was performed — the schema's `set_type_enum`.
#[uniffi::remote(Enum)]
pub enum SetType {
    Warmup,
    Working,
    Drop,
    Backoff,
    Amrap,
}

/// One logged set. `bodyWeightKg` and `isDeload` are resolved by the caller, because resolving them is
/// a query and the core does no I/O (INV-10). `rir` is nullable and a null is never a zero (INV-03).
#[uniffi::remote(Record)]
pub struct LoggedSet {
    pub set_type: SetType,
    pub is_completed: bool,
    pub weight_kg: Option<f64>,
    pub reps: Option<u32>,
    pub rir: Option<u32>,
    pub uses_bodyweight: bool,
    pub body_weight_kg: Option<f64>,
    pub is_deload: bool,
}

/// Which record was broken. Mirrors [`cyberathlete_core::PrKind`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum PrKind {
    MaxWeight,
    BestE1rm,
    MaxRepsAtWeight,
    BestSessionVolume,
}

impl From<cyberathlete_core::PrKind> for PrKind {
    fn from(kind: cyberathlete_core::PrKind) -> Self {
        match kind {
            cyberathlete_core::PrKind::MaxWeight => Self::MaxWeight,
            cyberathlete_core::PrKind::BestE1rm => Self::BestE1rm,
            cyberathlete_core::PrKind::MaxRepsAtWeight => Self::MaxRepsAtWeight,
            cyberathlete_core::PrKind::BestSessionVolume => Self::BestSessionVolume,
        }
    }
}

/// The most reps ever done at one exact load.
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
pub struct RepsAtWeight {
    pub weight_kg: f64,
    pub reps: u32,
}

impl From<RepsAtWeight> for cyberathlete_core::RepsAtWeight {
    fn from(best: RepsAtWeight) -> Self {
        Self {
            weight_kg: best.weight_kg,
            reps: best.reps,
        }
    }
}

impl From<cyberathlete_core::RepsAtWeight> for RepsAtWeight {
    fn from(best: cyberathlete_core::RepsAtWeight) -> Self {
        Self {
            weight_kg: best.weight_kg,
            reps: best.reps,
        }
    }
}

/// What an exercise's records stood at before the session being judged.
#[derive(Debug, Clone, PartialEq, uniffi::Record)]
pub struct PersonalBests {
    pub max_weight_kg: Option<f64>,
    pub best_e1rm_kg: Option<f64>,
    pub best_session_volume_kg: Option<f64>,
    pub best_reps_at_weight: Vec<RepsAtWeight>,
}

impl From<PersonalBests> for cyberathlete_core::PersonalBests {
    fn from(bests: PersonalBests) -> Self {
        Self {
            max_weight_kg: bests.max_weight_kg,
            best_e1rm_kg: bests.best_e1rm_kg,
            best_session_volume_kg: bests.best_session_volume_kg,
            best_reps_at_weight: bests
                .best_reps_at_weight
                .into_iter()
                .map(Into::into)
                .collect(),
        }
    }
}

impl From<cyberathlete_core::PersonalBests> for PersonalBests {
    fn from(bests: cyberathlete_core::PersonalBests) -> Self {
        Self {
            max_weight_kg: bests.max_weight_kg,
            best_e1rm_kg: bests.best_e1rm_kg,
            best_session_volume_kg: bests.best_session_volume_kg,
            best_reps_at_weight: bests
                .best_reps_at_weight
                .into_iter()
                .map(Into::into)
                .collect(),
        }
    }
}

/// One record broken in the session just finished.
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
pub struct PrAchievement {
    pub kind: PrKind,
    pub value: f64,
    pub weight_kg: Option<f64>,
    pub reps: Option<u32>,
    pub rir: Option<u32>,
    pub set_index: Option<u32>,
}

impl From<cyberathlete_core::PrAchievement> for PrAchievement {
    fn from(pr: cyberathlete_core::PrAchievement) -> Self {
        Self {
            kind: pr.kind.into(),
            value: pr.value,
            weight_kg: pr.weight_kg,
            reps: pr.reps,
            rir: pr.rir,
            set_index: pr.set_index,
        }
    }
}

/// Whether a set counts toward volume, PRs and set counts (INV-04).
#[uniffi::export]
pub fn is_counted_set(set: LoggedSet) -> bool {
    cyberathlete_core::is_counted_set(&set)
}

/// The load a set actually moved, including the lifter for a bodyweight exercise (INV-07).
#[uniffi::export]
pub fn load_kg(set: LoggedSet) -> Option<f64> {
    cyberathlete_core::load_kg(&set)
}

/// The estimated one-rep max for one set, or null where INV-07 refuses to guess.
#[uniffi::export]
pub fn e1rm(set: LoggedSet) -> Option<f64> {
    cyberathlete_core::e1rm(&set)
}

/// [`e1rm`] over many sets in one crossing of the boundary, order and length preserved.
#[uniffi::export]
pub fn e1rm_series(sets: Vec<LoggedSet>) -> Vec<Option<f64>> {
    cyberathlete_core::e1rm_series(&sets)
}

/// Total tonnage of the counted sets, in kilograms (INV-04).
#[uniffi::export]
pub fn volume_kg(sets: Vec<LoggedSet>) -> f64 {
    cyberathlete_core::volume_kg(&sets)
}

/// How many of these sets counted (INV-04).
#[uniffi::export]
pub fn counted_set_count(sets: Vec<LoggedSet>) -> u32 {
    cyberathlete_core::counted_set_count(&sets)
}

/// Every record the session broke, in the core's fixed order (FR-2.15, INV-08).
#[uniffi::export]
pub fn detect_prs(previous: PersonalBests, session: Vec<LoggedSet>) -> Vec<PrAchievement> {
    cyberathlete_core::detect_prs(&previous.into(), &session)
        .into_iter()
        .map(Into::into)
        .collect()
}

/// An exercise's bests after a history of sessions, one workout's sets per session — the
/// `previous` for [`detect_prs`] (task 004 stage 6). The whole history crosses in one call.
#[uniffi::export]
pub fn personal_bests(sessions: Vec<Vec<LoggedSet>>) -> PersonalBests {
    cyberathlete_core::personal_bests(&sessions).into()
}

/// A record still standing after a history, and the session that set it. Mirrors
/// [`cyberathlete_core::StandingRecord`].
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
pub struct StandingRecord {
    pub record: PrAchievement,
    pub session_index: u32,
}

impl From<cyberathlete_core::StandingRecord> for StandingRecord {
    fn from(standing: cyberathlete_core::StandingRecord) -> Self {
        Self {
            record: standing.record.into(),
            session_index: standing.session_index,
        }
    }
}

/// Every record standing after a history, oldest session first, with where each was set (task 004
/// stage 7).
#[uniffi::export]
pub fn standing_records(sessions: Vec<Vec<LoggedSet>>) -> Vec<StandingRecord> {
    cyberathlete_core::standing_records(&sessions)
        .into_iter()
        .map(Into::into)
        .collect()
}

/// One session of one exercise, reduced to what its history charts. Mirrors
/// [`cyberathlete_core::SessionMetrics`].
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
pub struct SessionMetrics {
    pub top_load_kg: Option<f64>,
    pub best_e1rm_kg: Option<f64>,
    pub volume_kg: Option<f64>,
    pub counted_sets: u32,
}

impl From<cyberathlete_core::SessionMetrics> for SessionMetrics {
    fn from(metrics: cyberathlete_core::SessionMetrics) -> Self {
        Self {
            top_load_kg: metrics.top_load_kg,
            best_e1rm_kg: metrics.best_e1rm_kg,
            volume_kg: metrics.volume_kg,
            counted_sets: metrics.counted_sets,
        }
    }
}

/// Per-session metrics over a whole history in one crossing (task 004 stage 7).
#[uniffi::export]
pub fn session_metrics(sessions: Vec<Vec<LoggedSet>>) -> Vec<SessionMetrics> {
    cyberathlete_core::session_metrics(&sessions)
        .into_iter()
        .map(Into::into)
        .collect()
}

/// How an exercise is logged. Mirrors [`cyberathlete_core::Tracking`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum Tracking {
    WeightReps,
    RepsOnly,
    Duration,
    DistanceDuration,
}

impl From<Tracking> for cyberathlete_core::Tracking {
    fn from(tracking: Tracking) -> Self {
        match tracking {
            Tracking::WeightReps => Self::WeightReps,
            Tracking::RepsOnly => Self::RepsOnly,
            Tracking::Duration => Self::Duration,
            Tracking::DistanceDuration => Self::DistanceDuration,
        }
    }
}

/// A field a set can be missing. Mirrors [`cyberathlete_core::SetField`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum SetField {
    Reps,
    DurationS,
    DistanceM,
}

impl From<cyberathlete_core::SetField> for SetField {
    fn from(field: cyberathlete_core::SetField) -> Self {
        match field {
            cyberathlete_core::SetField::Reps => Self::Reps,
            cyberathlete_core::SetField::DurationS => Self::DurationS,
            cyberathlete_core::SetField::DistanceM => Self::DistanceM,
        }
    }
}

/// The measures a set row holds, as typed. Mirrors [`cyberathlete_core::SetEntry`].
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
pub struct SetEntry {
    pub reps: Option<u32>,
    pub duration_s: Option<u32>,
    pub distance_m: Option<f64>,
}

impl From<SetEntry> for cyberathlete_core::SetEntry {
    fn from(entry: SetEntry) -> Self {
        Self {
            reps: entry.reps,
            duration_s: entry.duration_s,
            distance_m: entry.distance_m,
        }
    }
}

/// The field a set is missing before it can be completed, or null (03 §4, task 004 stage 8).
#[uniffi::export]
pub fn missing_for_completion(tracking: Tracking, entry: SetEntry) -> Option<SetField> {
    cyberathlete_core::missing_for_completion(tracking.into(), &entry.into()).map(Into::into)
}

// ── Progression (task 005) ────────────────────────────────────────────────────────────────────────
//
// The whole planner, exposed as the core defines it. Dates are whole days since 1970-01-01 (`i32`);
// `apps/mobile/src/domain/progression.ts` holds the only conversion on the phone.

/// How a `linear_load`, `double_progression` or `rir_autoregulated` rule advances.
#[uniffi::remote(Enum)]
pub enum LoadStep {
    Kg(f64),
    BasisPoints(u32),
}

/// The five v1 strategies, each carrying what it needs (01 §3.2).
#[uniffi::remote(Enum)]
pub enum Strategy {
    Fixed,
    LinearLoad(LoadStep),
    DoubleProgression {
        step: LoadStep,
        rep_step: u32,
    },
    Percent1rm {
        wave_bp: Vec<u32>,
        baseline_e1rm_kg: f64,
    },
    RirAutoregulated {
        step: LoadStep,
        rir_start: Option<u32>,
        rir_end: Option<u32>,
    },
}

/// FR-3.8a: one target RIR for the exercise, or a ladder of offsets.
#[uniffi::remote(Enum)]
pub enum RirMode {
    PerExercise,
    PerSet { offsets: Vec<i32> },
}

/// FR-3.11: what an `Under` outcome does next.
#[uniffi::remote(Enum)]
pub enum FailurePolicy {
    Hold,
    RepeatCycle,
    ReduceLoad { load_bp: u32 },
}

/// One exercise's rule, resolved through FR-3.6's cascade by the caller.
#[uniffi::remote(Record)]
pub struct Rule {
    pub strategy: Strategy,
    pub min_reps: u32,
    pub max_reps: u32,
    pub min_rir: u32,
    pub max_rir: u32,
    pub rounding: RoundingMode,
    pub rir_mode: RirMode,
    pub failure_policy: FailurePolicy,
}

/// FR-3.1b's three deload modes.
#[uniffi::remote(Enum)]
pub enum DeloadPolicy {
    None,
    EveryN { every: u32, final_cycle: bool },
    Manual { cycles: Vec<u32> },
}

#[uniffi::remote(Record)]
pub struct LengthOverride {
    pub cycle_number: u32,
    pub length_days: u32,
}

/// The mesocycle as generation reads it.
#[uniffi::remote(Record)]
pub struct MesocycleSpec {
    pub start_day: i32,
    pub num_microcycles: u32,
    pub default_length_days: u32,
    pub length_overrides: Vec<LengthOverride>,
    pub deload: DeloadPolicy,
    pub deload_set_bp: u32,
    pub deload_load_bp: u32,
    pub deload_rir_bump: u32,
}

#[uniffi::remote(Record)]
pub struct CycleOneSet {
    pub set_index: u32,
    pub set_type: SetType,
    pub target_weight_kg: Option<f64>,
    pub target_reps: Option<u32>,
    pub target_rir: Option<u32>,
}

#[uniffi::remote(Record)]
pub struct ExerciseSpec {
    pub order_index: u32,
    pub increment_kg: f64,
    pub rule: Rule,
    pub uses_bodyweight: bool,
    pub body_weight_kg: Option<f64>,
    pub sets: Vec<CycleOneSet>,
}

#[uniffi::remote(Record)]
pub struct SessionSpec {
    pub day_index: u32,
    pub order_index: u32,
    pub exercises: Vec<ExerciseSpec>,
}

#[uniffi::remote(Record)]
pub struct PlannedSet {
    pub set_index: u32,
    pub set_type: SetType,
    pub target_weight_kg: Option<f64>,
    pub target_reps: Option<u32>,
    pub target_min_reps: Option<u32>,
    pub target_max_reps: Option<u32>,
    pub target_rir: Option<u32>,
    pub was_clamped: bool,
}

#[uniffi::remote(Record)]
pub struct PlannedExercise {
    pub order_index: u32,
    pub sets: Vec<PlannedSet>,
}

#[uniffi::remote(Record)]
pub struct PlannedSession {
    pub day_index: u32,
    pub order_index: u32,
    pub exercises: Vec<PlannedExercise>,
}

#[uniffi::remote(Record)]
pub struct PlannedMicrocycle {
    pub cycle_number: u32,
    pub length_days: u32,
    pub starts_on: i32,
    pub is_deload: bool,
    pub engine_version: u32,
    pub sessions: Vec<PlannedSession>,
}

#[uniffi::remote(Enum)]
pub enum CycleStatus {
    Projected,
    Locked,
    InProgress,
    Completed,
    Skipped,
}

#[uniffi::remote(Enum)]
pub enum WriteKind {
    Engine,
    User,
}

#[uniffi::remote(Enum)]
pub enum SetOrigin {
    Generated,
    UserEdited,
}

#[uniffi::remote(Record)]
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
    pub is_pinned: bool,
}

#[uniffi::remote(Record)]
pub struct PlanExercise {
    pub order_index: u32,
    pub exercise_id: String,
    pub increment_kg: f64,
    pub rule: Rule,
    pub uses_bodyweight: bool,
    pub body_weight_kg: Option<f64>,
    pub sets: Vec<PlanSet>,
}

#[uniffi::remote(Record)]
pub struct PlanSession {
    pub day_index: u32,
    pub order_index: u32,
    pub exercises: Vec<PlanExercise>,
}

#[uniffi::remote(Record)]
pub struct PlanCycle {
    pub cycle_number: u32,
    pub length_days: u32,
    pub starts_on: i32,
    pub is_deload: bool,
    pub status: CycleStatus,
    pub engine_version: u32,
    pub last_write_kind: WriteKind,
    pub sessions: Vec<PlanSession>,
}

#[uniffi::remote(Record)]
pub struct PlanLog {
    pub cycle_number: u32,
    pub day_index: u32,
    pub session_order_index: u32,
    pub exercise_order_index: u32,
    pub set_index: u32,
    pub set: LoggedSet,
}

#[uniffi::remote(Enum)]
pub enum Outcome {
    Exceeded,
    Met,
    Under,
    Missed,
}

#[uniffi::remote(Record)]
pub struct SlotOutcome {
    pub cycle_number: u32,
    pub exercise_id: String,
    pub occurrence: u32,
    pub outcome: Outcome,
    pub open_loop: bool,
}

#[uniffi::remote(Record)]
pub struct Reconciled {
    pub cycles: Vec<PlanCycle>,
    pub outcomes: Vec<SlotOutcome>,
}

#[uniffi::remote(Record)]
pub struct Shortened {
    pub cycles: Vec<PlanCycle>,
    pub dropped: Vec<u32>,
}

/// A block edit the engine refused (task 005 stage 3b): why — `started`, `locked`, `history`,
/// `session_does_not_fit`, `newer_engine`, `out_of_range`, `no_such_cycle`, `no_such_exercise` — and
/// where. Thrown to JavaScript as an error the caller can read.
#[derive(Debug, uniffi::Error)]
pub enum PlanError {
    Refused {
        reason: String,
        cycle_number: Option<u32>,
        day_index: Option<u32>,
    },
}

impl std::fmt::Display for PlanError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Refused {
                reason,
                cycle_number,
                day_index,
            } => write!(
                formatter,
                "plan edit refused: {reason} (cycle {cycle_number:?}, day {day_index:?})"
            ),
        }
    }
}

impl std::error::Error for PlanError {}

impl From<Refusal> for PlanError {
    fn from(refusal: Refusal) -> Self {
        Self::Refused {
            reason: refusal.reason.name().to_owned(),
            cycle_number: refusal.cycle_number,
            day_index: refusal.day_index,
        }
    }
}

/// The engine that stamps every projection (INV-06). Not `coreVersion`, which names the build.
#[uniffi::export]
pub fn engine_version() -> u32 {
    cyberathlete_core::ENGINE_VERSION
}

/// Microcycles 2..N from microcycle 1 (FR-3.3), dated and stamped.
#[uniffi::export]
pub fn generate(mesocycle: MesocycleSpec, cycle_one: Vec<SessionSpec>) -> Vec<PlannedMicrocycle> {
    cyberathlete_core::generate(&mesocycle, &cycle_one)
}

/// The day each cycle starts on, walking the block from `start_day` (03 §5).
#[uniffi::export]
pub fn resolve_dates(start_day: i32, length_days: Vec<u32>) -> Vec<i32> {
    cyberathlete_core::resolve_dates(start_day, &length_days)
}

/// How one planned exercise went (01 §3.4).
#[uniffi::export]
pub fn classify(planned: Vec<PlanSet>, logs: Vec<PlanLog>) -> Outcome {
    cyberathlete_core::classify(&planned, &logs)
}

/// Move each cycle's status on from the logs, as of `today` — settle, then reconcile, then write.
#[uniffi::export]
pub fn settle_statuses(plan: Vec<PlanCycle>, logs: Vec<PlanLog>, today: i32) -> Vec<PlanCycle> {
    cyberathlete_core::settle_statuses(&plan, &logs, today)
}

/// Re-project the plan from what was logged, as of `today` (01 §3.4, INV-06).
#[uniffi::export]
pub fn reconcile(
    mesocycle: MesocycleSpec,
    plan: Vec<PlanCycle>,
    logs: Vec<PlanLog>,
    today: i32,
) -> Reconciled {
    cyberathlete_core::reconcile(&mesocycle, &plan, &logs, today)
}

/// Lengthen a block to `to` cycles, changing nothing before the first new one (FR-3.1c).
#[uniffi::export]
pub fn extend(
    mesocycle: MesocycleSpec,
    plan: Vec<PlanCycle>,
    logs: Vec<PlanLog>,
    today: i32,
    to: u32,
) -> Result<Vec<PlanCycle>, PlanError> {
    Ok(cyberathlete_core::extend(
        &mesocycle, &plan, &logs, today, to,
    )?)
}

/// Shorten a block to `to` cycles; the dropped numbers are for the caller to archive (INV-11).
#[uniffi::export]
pub fn shorten(plan: Vec<PlanCycle>, logs: Vec<PlanLog>, to: u32) -> Result<Shortened, PlanError> {
    Ok(cyberathlete_core::shorten(&plan, &logs, to)?)
}

/// Give one cycle a length of `days`; every later start follows it (FR-3.1a).
#[uniffi::export]
pub fn relength(
    plan: Vec<PlanCycle>,
    logs: Vec<PlanLog>,
    cycle_number: u32,
    days: u32,
) -> Result<Vec<PlanCycle>, PlanError> {
    Ok(cyberathlete_core::relength(
        &plan,
        &logs,
        cycle_number,
        days,
    )?)
}

/// Put `rule` on one exercise from `from_cycle` on, and reconcile — preview and commit alike (FR-3.6a).
#[uniffi::export]
#[expect(
    clippy::too_many_arguments,
    reason = "reconcile's four arguments and the edit's four; the generated TypeScript names them"
)]
pub fn switch_rule(
    mesocycle: MesocycleSpec,
    plan: Vec<PlanCycle>,
    logs: Vec<PlanLog>,
    today: i32,
    exercise_id: String,
    occurrence: u32,
    from_cycle: u32,
    rule: Rule,
) -> Result<Reconciled, PlanError> {
    Ok(cyberathlete_core::switch_rule(
        &mesocycle,
        &plan,
        &logs,
        today,
        &exercise_id,
        occurrence,
        from_cycle,
        &rule,
    )?)
}
