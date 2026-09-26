//! The core, as a Python extension module — the server half of [ADR-004](../../../../docs/decisions/ADR-004.md).
//!
//! This crate holds no logic. It translates types at the boundary and calls
//! [`cyberathlete_core`], so that the server and the phone run the same arithmetic rather than two
//! implementations that agree until they do not (INV-10).
//!
//! The boundary carries plain data — floats and a C-like enum — which is where PyO3 interop is
//! pleasant rather than painful, and is the rule ADR-004 sets for keeping it that way.

use std::collections::BTreeMap;

use cyberathlete_core::{
    CycleOneSet, CycleStatus, DeloadPolicy, ENGINE_VERSION, EpochDay, ExerciseSpec, FailurePolicy,
    LengthOverride, LoadStep, LoggedSet, MesocycleSpec, Outcome, PersonalBests, PlanCycle,
    PlanExercise, PlanLog, PlanSession, PlanSet, PlannedExercise, PlannedMicrocycle,
    PlannedSession, PlannedSet, PrAchievement, PrKind, Refusal, RepsAtWeight, RirMode,
    RoundingMode, Rule, SessionMetrics, SessionSpec, SetEntry, SetField, SetOrigin, SetType,
    Shortened, SlotOutcome, StandingRecord, Strategy, Tracking, WriteKind,
    classify as core_classify, counted_set_count as core_counted_set_count,
    detect_prs as core_detect_prs, e1rm as core_e1rm, e1rm_series as core_e1rm_series,
    extend as core_extend, generate as core_generate, is_counted_set as core_is_counted_set,
    load_kg as core_load_kg, missing_for_completion as core_missing_for_completion,
    personal_bests as core_personal_bests, reconcile as core_reconcile, relength as core_relength,
    resolve_dates as core_resolve_dates, round_to_increment as core_round_to_increment,
    session_metrics as core_session_metrics, shorten as core_shorten,
    standing_records as core_standing_records, switch_rule as core_switch_rule,
    volume_kg as core_volume_kg,
};
use pyo3::create_exception;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// Which way a load between two steps is moved. Mirrors [`RoundingMode`] on the Python side.
///
/// A real enum rather than a string: an unknown mode is then unrepresentable at the call site
/// instead of being a runtime error deep inside a projection.
// `from_py_object` is opted into explicitly: PyO3 0.29 deprecates deriving it implicitly for a
// `Clone` pyclass, and `round_to_increment` takes the mode by value, so it is needed.
#[pyclass(
    name = "RoundingMode",
    eq,
    eq_int,
    frozen,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PyRoundingMode {
    Nearest,
    Down,
    Up,
}

impl From<PyRoundingMode> for RoundingMode {
    fn from(mode: PyRoundingMode) -> Self {
        match mode {
            PyRoundingMode::Nearest => Self::Nearest,
            PyRoundingMode::Down => Self::Down,
            PyRoundingMode::Up => Self::Up,
        }
    }
}

#[pymethods]
impl PyRoundingMode {
    /// The name this mode carries in the shared fixtures, so a fixture-driven test needs no
    /// mapping table of its own.
    #[staticmethod]
    fn from_name(name: &str) -> PyResult<Self> {
        match RoundingMode::from_name(name) {
            Some(RoundingMode::Nearest) => Ok(Self::Nearest),
            Some(RoundingMode::Down) => Ok(Self::Down),
            Some(RoundingMode::Up) => Ok(Self::Up),
            None => Err(PyValueError::new_err(format!(
                "unknown rounding mode {name:?}; expected nearest, down or up"
            ))),
        }
    }

    #[getter]
    fn name(&self) -> &'static str {
        RoundingMode::from(*self).name()
    }
}

/// Round a load to a multiple of an increment (INV-02).
#[pyfunction]
#[pyo3(signature = (weight_kg, increment_kg, mode))]
fn round_to_increment(weight_kg: f64, increment_kg: f64, mode: PyRoundingMode) -> f64 {
    core_round_to_increment(weight_kg, increment_kg, mode.into())
}

/// The version of the core this module was built from, so a deployment can be identified. It is
/// **not** `ENGINE_VERSION` — that is a projection's stamp (INV-06) and arrives with task 005.
#[pyfunction]
fn core_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

// ── Strength (task 004) ───────────────────────────────────────────────────────────────────────────
//
// Marshalling, as above. The server reaches these through `app/domain/`, never by importing
// `cyberathlete_core` directly — the same import-linter fence that guards `round_to_increment`.

/// How a set was performed. Mirrors [`SetType`] on the Python side.
#[pyclass(
    name = "SetType",
    eq,
    eq_int,
    frozen,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PySetType {
    Warmup,
    Working,
    Drop,
    Backoff,
    Amrap,
}

impl From<PySetType> for SetType {
    fn from(set_type: PySetType) -> Self {
        match set_type {
            PySetType::Warmup => Self::Warmup,
            PySetType::Working => Self::Working,
            PySetType::Drop => Self::Drop,
            PySetType::Backoff => Self::Backoff,
            PySetType::Amrap => Self::Amrap,
        }
    }
}

impl From<SetType> for PySetType {
    fn from(set_type: SetType) -> Self {
        match set_type {
            SetType::Warmup => Self::Warmup,
            SetType::Working => Self::Working,
            SetType::Drop => Self::Drop,
            SetType::Backoff => Self::Backoff,
            SetType::Amrap => Self::Amrap,
        }
    }
}

#[pymethods]
impl PySetType {
    /// The name this type carries in the database and the shared fixtures.
    #[staticmethod]
    fn from_name(name: &str) -> PyResult<Self> {
        match SetType::from_name(name) {
            Some(SetType::Warmup) => Ok(Self::Warmup),
            Some(SetType::Working) => Ok(Self::Working),
            Some(SetType::Drop) => Ok(Self::Drop),
            Some(SetType::Backoff) => Ok(Self::Backoff),
            Some(SetType::Amrap) => Ok(Self::Amrap),
            None => Err(PyValueError::new_err(format!(
                "unknown set type {name:?}; expected warmup, working, drop, backoff or amrap"
            ))),
        }
    }

    #[getter]
    fn name(&self) -> &'static str {
        SetType::from(*self).name()
    }
}

/// One logged set. Mirrors [`LoggedSet`].
///
/// `body_weight_kg` and `is_deload` are resolved by the caller: both are queries, and the core does
/// no I/O (INV-10). `rir` is nullable and a null is never a zero (INV-03).
#[pyclass(
    name = "LoggedSet",
    frozen,
    get_all,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PyLoggedSet {
    pub set_type: PySetType,
    pub is_completed: bool,
    pub weight_kg: Option<f64>,
    pub reps: Option<u32>,
    pub rir: Option<u32>,
    pub uses_bodyweight: bool,
    pub body_weight_kg: Option<f64>,
    pub is_deload: bool,
}

#[pymethods]
impl PyLoggedSet {
    #[new]
    #[pyo3(signature = (
        set_type,
        is_completed,
        weight_kg = None,
        reps = None,
        rir = None,
        uses_bodyweight = false,
        body_weight_kg = None,
        is_deload = false,
    ))]
    #[expect(
        clippy::too_many_arguments,
        reason = "a record mirroring the core's own fields one for one, not a call to remember the order of; Python names them at the call site"
    )]
    const fn new(
        set_type: PySetType,
        is_completed: bool,
        weight_kg: Option<f64>,
        reps: Option<u32>,
        rir: Option<u32>,
        uses_bodyweight: bool,
        body_weight_kg: Option<f64>,
        is_deload: bool,
    ) -> Self {
        Self {
            set_type,
            is_completed,
            weight_kg,
            reps,
            rir,
            uses_bodyweight,
            body_weight_kg,
            is_deload,
        }
    }
}

impl From<PyLoggedSet> for LoggedSet {
    fn from(set: PyLoggedSet) -> Self {
        Self {
            set_type: set.set_type.into(),
            is_completed: set.is_completed,
            weight_kg: set.weight_kg,
            reps: set.reps,
            rir: set.rir,
            uses_bodyweight: set.uses_bodyweight,
            body_weight_kg: set.body_weight_kg,
            is_deload: set.is_deload,
        }
    }
}

fn to_core(sets: Vec<PyLoggedSet>) -> Vec<LoggedSet> {
    sets.into_iter().map(Into::into).collect()
}

/// Which record was broken. Mirrors [`PrKind`].
#[pyclass(
    name = "PrKind",
    eq,
    eq_int,
    frozen,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PyPrKind {
    MaxWeight,
    BestE1rm,
    MaxRepsAtWeight,
    BestSessionVolume,
}

impl From<PrKind> for PyPrKind {
    fn from(kind: PrKind) -> Self {
        match kind {
            PrKind::MaxWeight => Self::MaxWeight,
            PrKind::BestE1rm => Self::BestE1rm,
            PrKind::MaxRepsAtWeight => Self::MaxRepsAtWeight,
            PrKind::BestSessionVolume => Self::BestSessionVolume,
        }
    }
}

#[pymethods]
impl PyPrKind {
    /// The name this kind carries in `pr_kind_enum` and the shared fixtures.
    #[getter]
    fn name(&self) -> &'static str {
        match self {
            Self::MaxWeight => PrKind::MaxWeight.name(),
            Self::BestE1rm => PrKind::BestE1rm.name(),
            Self::MaxRepsAtWeight => PrKind::MaxRepsAtWeight.name(),
            Self::BestSessionVolume => PrKind::BestSessionVolume.name(),
        }
    }
}

/// The most reps ever done at one exact load.
#[pyclass(
    name = "RepsAtWeight",
    frozen,
    get_all,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PyRepsAtWeight {
    pub weight_kg: f64,
    pub reps: u32,
}

#[pymethods]
impl PyRepsAtWeight {
    #[new]
    const fn new(weight_kg: f64, reps: u32) -> Self {
        Self { weight_kg, reps }
    }
}

impl From<PyRepsAtWeight> for RepsAtWeight {
    fn from(best: PyRepsAtWeight) -> Self {
        Self {
            weight_kg: best.weight_kg,
            reps: best.reps,
        }
    }
}

impl From<RepsAtWeight> for PyRepsAtWeight {
    fn from(best: RepsAtWeight) -> Self {
        Self {
            weight_kg: best.weight_kg,
            reps: best.reps,
        }
    }
}

/// What an exercise's records stood at before the session being judged.
#[pyclass(
    name = "PersonalBests",
    frozen,
    get_all,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq)]
pub struct PyPersonalBests {
    pub max_weight_kg: Option<f64>,
    pub best_e1rm_kg: Option<f64>,
    pub best_session_volume_kg: Option<f64>,
    pub best_reps_at_weight: Vec<PyRepsAtWeight>,
}

#[pymethods]
impl PyPersonalBests {
    #[new]
    #[pyo3(signature = (
        max_weight_kg = None,
        best_e1rm_kg = None,
        best_session_volume_kg = None,
        best_reps_at_weight = Vec::new(),
    ))]
    const fn new(
        max_weight_kg: Option<f64>,
        best_e1rm_kg: Option<f64>,
        best_session_volume_kg: Option<f64>,
        best_reps_at_weight: Vec<PyRepsAtWeight>,
    ) -> Self {
        Self {
            max_weight_kg,
            best_e1rm_kg,
            best_session_volume_kg,
            best_reps_at_weight,
        }
    }
}

impl From<PyPersonalBests> for PersonalBests {
    fn from(bests: PyPersonalBests) -> Self {
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

impl From<PersonalBests> for PyPersonalBests {
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

/// One record broken in the session just finished.
// `skip_from_py_object`: an achievement only ever leaves the core. Nothing hands one back in, and
// declaring the conversion we do not need would be a boundary wider than the surface.
#[pyclass(
    name = "PrAchievement",
    frozen,
    get_all,
    skip_from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PyPrAchievement {
    pub kind: PyPrKind,
    pub value: f64,
    pub weight_kg: Option<f64>,
    pub reps: Option<u32>,
    pub rir: Option<u32>,
    pub set_index: Option<u32>,
}

impl From<PrAchievement> for PyPrAchievement {
    fn from(pr: PrAchievement) -> Self {
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
#[pyfunction]
fn is_counted_set(set: PyLoggedSet) -> bool {
    core_is_counted_set(&set.into())
}

/// The load a set actually moved, including the lifter for a bodyweight exercise (INV-07).
#[pyfunction]
fn load_kg(set: PyLoggedSet) -> Option<f64> {
    core_load_kg(&set.into())
}

/// The estimated one-rep max for one set, or `None` where INV-07 refuses to guess.
#[pyfunction]
fn e1rm(set: PyLoggedSet) -> Option<f64> {
    core_e1rm(&set.into())
}

/// [`e1rm`] over many sets at once, order and length preserved.
#[pyfunction]
fn e1rm_series(sets: Vec<PyLoggedSet>) -> Vec<Option<f64>> {
    core_e1rm_series(&to_core(sets))
}

/// Total tonnage of the counted sets, in kilograms (INV-04).
#[pyfunction]
fn volume_kg(sets: Vec<PyLoggedSet>) -> f64 {
    core_volume_kg(&to_core(sets))
}

/// How many of these sets counted (INV-04).
#[pyfunction]
fn counted_set_count(sets: Vec<PyLoggedSet>) -> u32 {
    core_counted_set_count(&to_core(sets))
}

/// Every record the session broke, in the core's fixed order (FR-2.15, INV-08).
#[pyfunction]
fn detect_prs(previous: PyPersonalBests, session: Vec<PyLoggedSet>) -> Vec<PyPrAchievement> {
    core_detect_prs(&previous.into(), &to_core(session))
        .into_iter()
        .map(Into::into)
        .collect()
}

fn sessions_to_core(sessions: Vec<Vec<PyLoggedSet>>) -> Vec<Vec<LoggedSet>> {
    sessions.into_iter().map(to_core).collect()
}

/// An exercise's bests after a history of sessions, one workout's sets per session — the
/// `previous` for [`detect_prs`].
#[pyfunction]
fn personal_bests(sessions: Vec<Vec<PyLoggedSet>>) -> PyPersonalBests {
    core_personal_bests(&sessions_to_core(sessions)).into()
}

/// A record still standing after a history, and the session that set it. Mirrors
/// [`StandingRecord`].
#[pyclass(
    name = "StandingRecord",
    frozen,
    get_all,
    skip_from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PyStandingRecord {
    pub record: PyPrAchievement,
    pub session_index: u32,
}

impl From<StandingRecord> for PyStandingRecord {
    fn from(standing: StandingRecord) -> Self {
        Self {
            record: standing.record.into(),
            session_index: standing.session_index,
        }
    }
}

/// Every record standing after a history, oldest session first, with where each was set — what the
/// server's `personal_records` rebuild stores (task 004 stage 7).
#[pyfunction]
fn standing_records(sessions: Vec<Vec<PyLoggedSet>>) -> Vec<PyStandingRecord> {
    core_standing_records(&sessions_to_core(sessions))
        .into_iter()
        .map(Into::into)
        .collect()
}

/// One session of one exercise, reduced to what its history charts. Mirrors [`SessionMetrics`].
#[pyclass(
    name = "SessionMetrics",
    frozen,
    get_all,
    skip_from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PySessionMetrics {
    pub top_load_kg: Option<f64>,
    pub best_e1rm_kg: Option<f64>,
    pub volume_kg: Option<f64>,
    pub counted_sets: u32,
}

impl From<SessionMetrics> for PySessionMetrics {
    fn from(metrics: SessionMetrics) -> Self {
        Self {
            top_load_kg: metrics.top_load_kg,
            best_e1rm_kg: metrics.best_e1rm_kg,
            volume_kg: metrics.volume_kg,
            counted_sets: metrics.counted_sets,
        }
    }
}

/// Per-session metrics over a whole history (task 004 stage 7).
#[pyfunction]
fn session_metrics(sessions: Vec<Vec<PyLoggedSet>>) -> Vec<PySessionMetrics> {
    core_session_metrics(&sessions_to_core(sessions))
        .into_iter()
        .map(Into::into)
        .collect()
}

/// How an exercise is logged — the schema's `tracking_enum`. Mirrors [`Tracking`].
#[pyclass(
    name = "Tracking",
    eq,
    eq_int,
    frozen,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PyTracking {
    WeightReps,
    RepsOnly,
    Duration,
    DistanceDuration,
}

impl From<PyTracking> for Tracking {
    fn from(tracking: PyTracking) -> Self {
        match tracking {
            PyTracking::WeightReps => Self::WeightReps,
            PyTracking::RepsOnly => Self::RepsOnly,
            PyTracking::Duration => Self::Duration,
            PyTracking::DistanceDuration => Self::DistanceDuration,
        }
    }
}

#[pymethods]
impl PyTracking {
    /// The name this mode carries in the database and the shared fixtures.
    #[staticmethod]
    fn from_name(name: &str) -> PyResult<Self> {
        match Tracking::from_name(name) {
            Some(Tracking::WeightReps) => Ok(Self::WeightReps),
            Some(Tracking::RepsOnly) => Ok(Self::RepsOnly),
            Some(Tracking::Duration) => Ok(Self::Duration),
            Some(Tracking::DistanceDuration) => Ok(Self::DistanceDuration),
            None => Err(PyValueError::new_err(format!(
                "unknown tracking mode {name:?}; expected weight_reps, reps_only, duration or distance_duration"
            ))),
        }
    }

    #[getter]
    fn name(&self) -> &'static str {
        Tracking::from(*self).name()
    }
}

/// The measures a set row holds, as typed. Mirrors [`SetEntry`].
#[pyclass(
    name = "SetEntry",
    frozen,
    get_all,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PySetEntry {
    pub reps: Option<u32>,
    pub duration_s: Option<u32>,
    pub distance_m: Option<f64>,
}

#[pymethods]
impl PySetEntry {
    #[new]
    #[pyo3(signature = (reps = None, duration_s = None, distance_m = None))]
    const fn new(reps: Option<u32>, duration_s: Option<u32>, distance_m: Option<f64>) -> Self {
        Self {
            reps,
            duration_s,
            distance_m,
        }
    }
}

impl From<PySetEntry> for SetEntry {
    fn from(entry: PySetEntry) -> Self {
        Self {
            reps: entry.reps,
            duration_s: entry.duration_s,
            distance_m: entry.distance_m,
        }
    }
}

/// The `set_logs` column a set is missing before it can be completed, or `None` (03 §4, task 004
/// stage 8). Returned as the column's name, which is what an API error points at.
#[pyfunction]
fn missing_for_completion(tracking: PyTracking, entry: PySetEntry) -> Option<&'static str> {
    core_missing_for_completion(tracking.into(), &entry.into()).map(SetField::name)
}

// ── Progression (task 005) ────────────────────────────────────────────────────────────────────────
//
// The input records check themselves when Python builds them, so a rule with no step or a deload mode
// the schema does not know is a `ValueError` at the call site, never a surprise deep inside a
// projection. Each holds the core's own value once checked. The outputs are the core's rows, read-only.

/// Which progression strategy a rule applies — the five v1 values of the schema's
/// `progression_strategy_enum`. `cycle_pattern` is v2 and refused by name.
#[pyclass(
    name = "ProgressionStrategy",
    eq,
    eq_int,
    frozen,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PyProgressionStrategy {
    Fixed,
    LinearLoad,
    DoubleProgression,
    Percent1rm,
    RirAutoregulated,
}

#[pymethods]
impl PyProgressionStrategy {
    /// The name this strategy carries in the database and the shared fixtures.
    #[staticmethod]
    fn from_name(name: &str) -> PyResult<Self> {
        match name {
            "fixed" => Ok(Self::Fixed),
            "linear_load" => Ok(Self::LinearLoad),
            "double_progression" => Ok(Self::DoubleProgression),
            "percent_1rm" => Ok(Self::Percent1rm),
            "rir_autoregulated" => Ok(Self::RirAutoregulated),
            "cycle_pattern" => Err(PyValueError::new_err(
                "cycle_pattern is v2 and not built (01 §3.2 (e))",
            )),
            _ => Err(PyValueError::new_err(format!(
                "unknown strategy {name:?}; expected fixed, linear_load, double_progression, percent_1rm or rir_autoregulated"
            ))),
        }
    }

    #[getter]
    const fn name(&self) -> &'static str {
        match self {
            Self::Fixed => "fixed",
            Self::LinearLoad => "linear_load",
            Self::DoubleProgression => "double_progression",
            Self::Percent1rm => "percent_1rm",
            Self::RirAutoregulated => "rir_autoregulated",
        }
    }
}

/// One exercise's progression rule, resolved through FR-3.6's cascade. Mirrors [`Rule`], taking the
/// `progression_rules` columns as the schema spells them and refusing a rule that lacks what its
/// strategy needs.
#[pyclass(
    name = "ProgressionRule",
    frozen,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq)]
pub struct PyProgressionRule {
    rule: Rule,
}

/// A rule's load step: exactly one of the schema's two columns.
fn load_step(
    strategy: PyProgressionStrategy,
    kg: Option<f64>,
    bp: Option<u32>,
) -> PyResult<LoadStep> {
    match (kg, bp) {
        (Some(kg), None) => Ok(LoadStep::Kg(kg)),
        (None, Some(bp)) => Ok(LoadStep::BasisPoints(bp)),
        _ => Err(PyValueError::new_err(format!(
            "{} takes exactly one of load_step_kg and load_step_bp",
            strategy.name()
        ))),
    }
}

#[pymethods]
impl PyProgressionRule {
    /// `linear_load`, `double_progression` and `rir_autoregulated` take exactly one of `load_step_kg` and
    /// `load_step_bp`; `percent_1rm` needs `baseline_e1rm_kg`. `rir_mode` is `per_exercise` or `per_set`,
    /// which reads `rir_offsets`. The defaults are the schema's (03 §5).
    #[new]
    #[pyo3(signature = (
        strategy,
        min_reps,
        max_reps,
        min_rir = 0,
        max_rir = 4,
        rounding = PyRoundingMode::Nearest,
        load_step_kg = None,
        load_step_bp = None,
        rep_step = None,
        percent_wave_bp = Vec::new(),
        baseline_e1rm_kg = None,
        rir_start = None,
        rir_end = None,
        rir_mode = "per_exercise",
        rir_offsets = Vec::new(),
        failure_policy = "hold",
        failure_load_bp = 9000,
    ))]
    #[expect(
        clippy::too_many_arguments,
        reason = "a record mirroring progression_rules column for column; Python names them at the call site"
    )]
    fn new(
        strategy: PyProgressionStrategy,
        min_reps: u32,
        max_reps: u32,
        min_rir: u32,
        max_rir: u32,
        rounding: PyRoundingMode,
        load_step_kg: Option<f64>,
        load_step_bp: Option<u32>,
        rep_step: Option<u32>,
        percent_wave_bp: Vec<u32>,
        baseline_e1rm_kg: Option<f64>,
        rir_start: Option<u32>,
        rir_end: Option<u32>,
        rir_mode: &str,
        rir_offsets: Vec<i32>,
        failure_policy: &str,
        failure_load_bp: u32,
    ) -> PyResult<Self> {
        let failure_policy = match failure_policy {
            "hold" => FailurePolicy::Hold,
            "repeat_cycle" => FailurePolicy::RepeatCycle,
            "reduce_load" => FailurePolicy::ReduceLoad {
                load_bp: failure_load_bp,
            },
            other => {
                return Err(PyValueError::new_err(format!(
                    "unknown failure_policy {other:?}; expected hold, repeat_cycle or reduce_load"
                )));
            }
        };
        let step = || load_step(strategy, load_step_kg, load_step_bp);
        let strategy = match strategy {
            PyProgressionStrategy::Fixed => Strategy::Fixed,
            PyProgressionStrategy::LinearLoad => Strategy::LinearLoad(step()?),
            PyProgressionStrategy::DoubleProgression => Strategy::DoubleProgression {
                step: step()?,
                // `rep_step smallint NULL DEFAULT 1`: a NULL reads as the default.
                rep_step: rep_step.unwrap_or(1),
            },
            PyProgressionStrategy::Percent1rm => Strategy::Percent1rm {
                wave_bp: percent_wave_bp,
                baseline_e1rm_kg: baseline_e1rm_kg.ok_or_else(|| {
                    PyValueError::new_err("percent_1rm needs baseline_e1rm_kg (FR-3.2c)")
                })?,
            },
            PyProgressionStrategy::RirAutoregulated => Strategy::RirAutoregulated {
                step: step()?,
                rir_start,
                rir_end,
            },
        };
        let rir_mode = match rir_mode {
            "per_exercise" => RirMode::PerExercise,
            "per_set" => RirMode::PerSet {
                offsets: rir_offsets,
            },
            other => {
                return Err(PyValueError::new_err(format!(
                    "unknown rir_mode {other:?}; expected per_exercise or per_set"
                )));
            }
        };
        Ok(Self {
            rule: Rule {
                strategy,
                min_reps,
                max_reps,
                min_rir,
                max_rir,
                rounding: rounding.into(),
                rir_mode,
                failure_policy,
            },
        })
    }
}

/// One set of cycle 1, as the user authored it. Mirrors [`CycleOneSet`].
#[pyclass(
    name = "CycleOneSet",
    frozen,
    get_all,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PyCycleOneSet {
    pub set_index: u32,
    pub set_type: PySetType,
    pub target_weight_kg: Option<f64>,
    pub target_reps: Option<u32>,
    pub target_rir: Option<u32>,
}

#[pymethods]
impl PyCycleOneSet {
    #[new]
    #[pyo3(signature = (
        set_index,
        set_type,
        target_weight_kg = None,
        target_reps = None,
        target_rir = None,
    ))]
    const fn new(
        set_index: u32,
        set_type: PySetType,
        target_weight_kg: Option<f64>,
        target_reps: Option<u32>,
        target_rir: Option<u32>,
    ) -> Self {
        Self {
            set_index,
            set_type,
            target_weight_kg,
            target_reps,
            target_rir,
        }
    }
}

impl From<PyCycleOneSet> for CycleOneSet {
    fn from(set: PyCycleOneSet) -> Self {
        Self {
            set_index: set.set_index,
            set_type: set.set_type.into(),
            target_weight_kg: set.target_weight_kg,
            target_reps: set.target_reps,
            target_rir: set.target_rir,
        }
    }
}

/// One exercise of cycle 1, its rule and increment already resolved. Mirrors [`ExerciseSpec`].
#[pyclass(
    name = "ExerciseSpec",
    frozen,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq)]
pub struct PyExerciseSpec {
    exercise: ExerciseSpec,
}

#[pymethods]
impl PyExerciseSpec {
    /// `body_weight_kg` is the latest body weight, read only by `percent_1rm` on a bodyweight exercise.
    #[new]
    #[pyo3(signature = (
        order_index,
        increment_kg,
        rule,
        sets,
        uses_bodyweight = false,
        body_weight_kg = None,
    ))]
    fn new(
        order_index: u32,
        increment_kg: f64,
        rule: PyProgressionRule,
        sets: Vec<PyCycleOneSet>,
        uses_bodyweight: bool,
        body_weight_kg: Option<f64>,
    ) -> Self {
        Self {
            exercise: ExerciseSpec {
                order_index,
                increment_kg,
                rule: rule.rule,
                uses_bodyweight,
                body_weight_kg,
                sets: sets.into_iter().map(Into::into).collect(),
            },
        }
    }
}

/// One session of cycle 1. Mirrors [`SessionSpec`].
#[pyclass(
    name = "SessionSpec",
    frozen,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq)]
pub struct PySessionSpec {
    session: SessionSpec,
}

#[pymethods]
impl PySessionSpec {
    #[new]
    fn new(day_index: u32, order_index: u32, exercises: Vec<PyExerciseSpec>) -> Self {
        Self {
            session: SessionSpec {
                day_index,
                order_index,
                exercises: exercises.into_iter().map(|it| it.exercise).collect(),
            },
        }
    }
}

/// The mesocycle, as generation reads it — the `mesocycles` row's columns, plus the cycles whose length
/// differs from the default and, for `manual`, the cycles flagged as deloads. Mirrors [`MesocycleSpec`].
#[pyclass(
    name = "MesocycleSpec",
    frozen,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PyMesocycleSpec {
    mesocycle: MesocycleSpec,
}

#[pymethods]
impl PyMesocycleSpec {
    /// `start_day` is whole days since 1970-01-01; `app.domain.progression.epoch_day` makes one from a
    /// `date`. The defaults are the schema's (03 §5).
    #[new]
    #[pyo3(signature = (
        start_day,
        num_microcycles,
        default_length_days,
        deload_mode,
        deload_every_n_microcycles = None,
        deload_final_cycle = false,
        deload_cycles = Vec::new(),
        length_overrides = BTreeMap::new(),
        deload_set_bp = 5000,
        deload_load_bp = 6000,
        deload_rir_bump = 2,
    ))]
    #[expect(
        clippy::too_many_arguments,
        reason = "a record mirroring the mesocycles row column for column; Python names them at the call site"
    )]
    fn new(
        start_day: EpochDay,
        num_microcycles: u32,
        default_length_days: u32,
        deload_mode: &str,
        deload_every_n_microcycles: Option<u32>,
        deload_final_cycle: bool,
        deload_cycles: Vec<u32>,
        length_overrides: BTreeMap<u32, u32>,
        deload_set_bp: u32,
        deload_load_bp: u32,
        deload_rir_bump: u32,
    ) -> PyResult<Self> {
        let deload = match (deload_mode, deload_every_n_microcycles) {
            ("none", _) => DeloadPolicy::None,
            ("every_n_microcycles", Some(every)) => DeloadPolicy::EveryN {
                every,
                final_cycle: deload_final_cycle,
            },
            ("every_n_microcycles", None) => {
                return Err(PyValueError::new_err(
                    "every_n_microcycles needs deload_every_n_microcycles",
                ));
            }
            ("manual", _) => DeloadPolicy::Manual {
                cycles: deload_cycles,
            },
            (other, _) => {
                return Err(PyValueError::new_err(format!(
                    "unknown deload mode {other:?}; expected none, every_n_microcycles or manual"
                )));
            }
        };
        Ok(Self {
            mesocycle: MesocycleSpec {
                start_day,
                num_microcycles,
                default_length_days,
                length_overrides: length_overrides
                    .into_iter()
                    .map(|(cycle_number, length_days)| LengthOverride {
                        cycle_number,
                        length_days,
                    })
                    .collect(),
                deload,
                deload_set_bp,
                deload_load_bp,
                deload_rir_bump,
            },
        })
    }
}

/// A generated `planned_sets` row. Mirrors [`PlannedSet`].
#[pyclass(
    name = "PlannedSet",
    frozen,
    get_all,
    skip_from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PyPlannedSet {
    pub set_index: u32,
    pub set_type: PySetType,
    pub target_weight_kg: Option<f64>,
    pub target_reps: Option<u32>,
    pub target_min_reps: Option<u32>,
    pub target_max_reps: Option<u32>,
    pub target_rir: Option<u32>,
    pub was_clamped: bool,
}

impl From<PlannedSet> for PyPlannedSet {
    fn from(set: PlannedSet) -> Self {
        Self {
            set_index: set.set_index,
            set_type: set.set_type.into(),
            target_weight_kg: set.target_weight_kg,
            target_reps: set.target_reps,
            target_min_reps: set.target_min_reps,
            target_max_reps: set.target_max_reps,
            target_rir: set.target_rir,
            was_clamped: set.was_clamped,
        }
    }
}

/// A generated `planned_exercises` row. Mirrors [`PlannedExercise`].
#[pyclass(
    name = "PlannedExercise",
    frozen,
    get_all,
    skip_from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq)]
pub struct PyPlannedExercise {
    pub order_index: u32,
    pub sets: Vec<PyPlannedSet>,
}

impl From<PlannedExercise> for PyPlannedExercise {
    fn from(exercise: PlannedExercise) -> Self {
        Self {
            order_index: exercise.order_index,
            sets: exercise.sets.into_iter().map(Into::into).collect(),
        }
    }
}

/// A generated `planned_sessions` row. Mirrors [`PlannedSession`].
#[pyclass(
    name = "PlannedSession",
    frozen,
    get_all,
    skip_from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq)]
pub struct PyPlannedSession {
    pub day_index: u32,
    pub order_index: u32,
    pub exercises: Vec<PyPlannedExercise>,
}

impl From<PlannedSession> for PyPlannedSession {
    fn from(session: PlannedSession) -> Self {
        Self {
            day_index: session.day_index,
            order_index: session.order_index,
            exercises: session.exercises.into_iter().map(Into::into).collect(),
        }
    }
}

/// A generated `microcycles` row. Mirrors [`PlannedMicrocycle`].
#[pyclass(
    name = "PlannedMicrocycle",
    frozen,
    get_all,
    skip_from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq)]
pub struct PyPlannedMicrocycle {
    pub cycle_number: u32,
    pub length_days: u32,
    pub starts_on: EpochDay,
    pub is_deload: bool,
    pub engine_version: u32,
    pub sessions: Vec<PyPlannedSession>,
}

impl From<PlannedMicrocycle> for PyPlannedMicrocycle {
    fn from(cycle: PlannedMicrocycle) -> Self {
        Self {
            cycle_number: cycle.cycle_number,
            length_days: cycle.length_days,
            starts_on: cycle.starts_on,
            is_deload: cycle.is_deload,
            engine_version: cycle.engine_version,
            sessions: cycle.sessions.into_iter().map(Into::into).collect(),
        }
    }
}

/// Microcycles 2..N from microcycle 1 (FR-3.3), dated and stamped with `ENGINE_VERSION`.
#[pyfunction]
fn generate(mesocycle: PyMesocycleSpec, cycle_one: Vec<PySessionSpec>) -> Vec<PyPlannedMicrocycle> {
    let sessions: Vec<SessionSpec> = cycle_one.into_iter().map(|it| it.session).collect();
    core_generate(&mesocycle.mesocycle, &sessions)
        .into_iter()
        .map(Into::into)
        .collect()
}

/// The day each cycle starts on, walking the block from `start_day` (03 §5, INV-25).
#[pyfunction]
fn resolve_dates(start_day: EpochDay, length_days: Vec<u32>) -> Vec<EpochDay> {
    core_resolve_dates(start_day, &length_days)
}

// ── Reconciliation (task 005 stage 3a) ───────────────────────────────────────────────────────────
//
// The plan as rows, both ways: `reconcile` reads it and hands it back. Each enum is the schema's, by
// name, and each record converts to the core's and back with nothing decided on the way.

/// A C-like mirror of one of the core's named enums, with `from_name` and `name` for the schema's text.
macro_rules! py_enum {
    ($py:ident, $name:literal, $core:ident { $($variant:ident),+ $(,)? }) => {
        #[doc = concat!("Mirrors [`", stringify!($core), "`].")]
        #[pyclass(name = $name, eq, eq_int, frozen, from_py_object, module = "cyberathlete_core")]
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum $py {
            $($variant,)+
        }

        impl From<$py> for $core {
            fn from(value: $py) -> Self {
                match value {
                    $($py::$variant => Self::$variant,)+
                }
            }
        }

        impl From<$core> for $py {
            fn from(value: $core) -> Self {
                match value {
                    $($core::$variant => Self::$variant,)+
                }
            }
        }

        #[pymethods]
        impl $py {
            /// The name this value carries in the schema and the shared fixtures.
            #[staticmethod]
            fn from_name(name: &str) -> PyResult<Self> {
                $core::from_name(name).map(Into::into).ok_or_else(|| {
                    PyValueError::new_err(format!(concat!("unknown ", $name, " {:?}"), name))
                })
            }

            #[getter]
            fn name(&self) -> &'static str {
                $core::from(*self).name()
            }
        }
    };
}

py_enum!(
    PyCycleStatus,
    "CycleStatus",
    CycleStatus {
        Projected,
        Locked,
        InProgress,
        Completed,
        Skipped,
    }
);
py_enum!(PyWriteKind, "WriteKind", WriteKind { Engine, User });
py_enum!(
    PySetOrigin,
    "SetOrigin",
    SetOrigin {
        Generated,
        UserEdited
    }
);
py_enum!(
    PyOutcome,
    "Outcome",
    Outcome {
        Exceeded,
        Met,
        Under,
        Missed,
    }
);

/// A `planned_sets` row. Mirrors [`PlanSet`].
#[pyclass(
    name = "PlanSet",
    frozen,
    get_all,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PyPlanSet {
    pub set_index: u32,
    pub set_type: PySetType,
    pub target_weight_kg: Option<f64>,
    pub target_reps: Option<u32>,
    pub target_min_reps: Option<u32>,
    pub target_max_reps: Option<u32>,
    pub target_rir: Option<u32>,
    pub was_clamped: bool,
    pub origin: PySetOrigin,
    pub is_pinned: bool,
}

#[pymethods]
impl PyPlanSet {
    #[new]
    #[pyo3(signature = (
        set_index,
        set_type,
        target_weight_kg = None,
        target_reps = None,
        target_min_reps = None,
        target_max_reps = None,
        target_rir = None,
        was_clamped = false,
        origin = PySetOrigin::Generated,
        is_pinned = false,
    ))]
    #[expect(
        clippy::too_many_arguments,
        reason = "a record mirroring planned_sets column for column; Python names them at the call site"
    )]
    const fn new(
        set_index: u32,
        set_type: PySetType,
        target_weight_kg: Option<f64>,
        target_reps: Option<u32>,
        target_min_reps: Option<u32>,
        target_max_reps: Option<u32>,
        target_rir: Option<u32>,
        was_clamped: bool,
        origin: PySetOrigin,
        is_pinned: bool,
    ) -> Self {
        Self {
            set_index,
            set_type,
            target_weight_kg,
            target_reps,
            target_min_reps,
            target_max_reps,
            target_rir,
            was_clamped,
            origin,
            is_pinned,
        }
    }
}

impl From<PyPlanSet> for PlanSet {
    fn from(set: PyPlanSet) -> Self {
        Self {
            set_index: set.set_index,
            set_type: set.set_type.into(),
            target_weight_kg: set.target_weight_kg,
            target_reps: set.target_reps,
            target_min_reps: set.target_min_reps,
            target_max_reps: set.target_max_reps,
            target_rir: set.target_rir,
            was_clamped: set.was_clamped,
            origin: set.origin.into(),
            is_pinned: set.is_pinned,
        }
    }
}

impl From<PlanSet> for PyPlanSet {
    fn from(set: PlanSet) -> Self {
        Self {
            set_index: set.set_index,
            set_type: set.set_type.into(),
            target_weight_kg: set.target_weight_kg,
            target_reps: set.target_reps,
            target_min_reps: set.target_min_reps,
            target_max_reps: set.target_max_reps,
            target_rir: set.target_rir,
            was_clamped: set.was_clamped,
            origin: set.origin.into(),
            is_pinned: set.is_pinned,
        }
    }
}

/// A `planned_exercises` row with what the engine reads resolved. Mirrors [`PlanExercise`].
#[pyclass(
    name = "PlanExercise",
    frozen,
    get_all,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq)]
pub struct PyPlanExercise {
    pub order_index: u32,
    pub exercise_id: String,
    pub increment_kg: f64,
    pub rule: PyProgressionRule,
    pub uses_bodyweight: bool,
    pub body_weight_kg: Option<f64>,
    pub sets: Vec<PyPlanSet>,
}

#[pymethods]
impl PyPlanExercise {
    /// `exercise_id` is opaque to the engine: two exercises are the same when their ids are equal.
    #[new]
    #[pyo3(signature = (
        order_index,
        exercise_id,
        increment_kg,
        rule,
        sets,
        uses_bodyweight = false,
        body_weight_kg = None,
    ))]
    const fn new(
        order_index: u32,
        exercise_id: String,
        increment_kg: f64,
        rule: PyProgressionRule,
        sets: Vec<PyPlanSet>,
        uses_bodyweight: bool,
        body_weight_kg: Option<f64>,
    ) -> Self {
        Self {
            order_index,
            exercise_id,
            increment_kg,
            rule,
            uses_bodyweight,
            body_weight_kg,
            sets,
        }
    }
}

impl From<PyPlanExercise> for PlanExercise {
    fn from(exercise: PyPlanExercise) -> Self {
        Self {
            order_index: exercise.order_index,
            exercise_id: exercise.exercise_id,
            increment_kg: exercise.increment_kg,
            rule: exercise.rule.rule,
            uses_bodyweight: exercise.uses_bodyweight,
            body_weight_kg: exercise.body_weight_kg,
            sets: exercise.sets.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<PlanExercise> for PyPlanExercise {
    fn from(exercise: PlanExercise) -> Self {
        Self {
            order_index: exercise.order_index,
            exercise_id: exercise.exercise_id,
            increment_kg: exercise.increment_kg,
            rule: PyProgressionRule {
                rule: exercise.rule,
            },
            uses_bodyweight: exercise.uses_bodyweight,
            body_weight_kg: exercise.body_weight_kg,
            sets: exercise.sets.into_iter().map(Into::into).collect(),
        }
    }
}

/// A `planned_sessions` row. Mirrors [`PlanSession`].
#[pyclass(
    name = "PlanSession",
    frozen,
    get_all,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq)]
pub struct PyPlanSession {
    pub day_index: u32,
    pub order_index: u32,
    pub exercises: Vec<PyPlanExercise>,
}

#[pymethods]
impl PyPlanSession {
    #[new]
    const fn new(day_index: u32, order_index: u32, exercises: Vec<PyPlanExercise>) -> Self {
        Self {
            day_index,
            order_index,
            exercises,
        }
    }
}

impl From<PyPlanSession> for PlanSession {
    fn from(session: PyPlanSession) -> Self {
        Self {
            day_index: session.day_index,
            order_index: session.order_index,
            exercises: session.exercises.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<PlanSession> for PyPlanSession {
    fn from(session: PlanSession) -> Self {
        Self {
            day_index: session.day_index,
            order_index: session.order_index,
            exercises: session.exercises.into_iter().map(Into::into).collect(),
        }
    }
}

/// A `microcycles` row. Mirrors [`PlanCycle`].
#[pyclass(
    name = "PlanCycle",
    frozen,
    get_all,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq)]
pub struct PyPlanCycle {
    pub cycle_number: u32,
    pub length_days: u32,
    pub starts_on: EpochDay,
    pub is_deload: bool,
    pub status: PyCycleStatus,
    pub engine_version: u32,
    pub last_write_kind: PyWriteKind,
    pub sessions: Vec<PyPlanSession>,
}

#[pymethods]
impl PyPlanCycle {
    #[new]
    #[expect(
        clippy::too_many_arguments,
        reason = "a record mirroring microcycles column for column; Python names them at the call site"
    )]
    const fn new(
        cycle_number: u32,
        length_days: u32,
        starts_on: EpochDay,
        is_deload: bool,
        status: PyCycleStatus,
        engine_version: u32,
        last_write_kind: PyWriteKind,
        sessions: Vec<PyPlanSession>,
    ) -> Self {
        Self {
            cycle_number,
            length_days,
            starts_on,
            is_deload,
            status,
            engine_version,
            last_write_kind,
            sessions,
        }
    }
}

impl From<PyPlanCycle> for PlanCycle {
    fn from(cycle: PyPlanCycle) -> Self {
        Self {
            cycle_number: cycle.cycle_number,
            length_days: cycle.length_days,
            starts_on: cycle.starts_on,
            is_deload: cycle.is_deload,
            status: cycle.status.into(),
            engine_version: cycle.engine_version,
            last_write_kind: cycle.last_write_kind.into(),
            sessions: cycle.sessions.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<PlanCycle> for PyPlanCycle {
    fn from(cycle: PlanCycle) -> Self {
        Self {
            cycle_number: cycle.cycle_number,
            length_days: cycle.length_days,
            starts_on: cycle.starts_on,
            is_deload: cycle.is_deload,
            status: cycle.status.into(),
            engine_version: cycle.engine_version,
            last_write_kind: cycle.last_write_kind.into(),
            sessions: cycle.sessions.into_iter().map(Into::into).collect(),
        }
    }
}

/// A logged set on the planned set it was logged against. Mirrors [`PlanLog`].
#[pyclass(
    name = "PlanLog",
    frozen,
    get_all,
    from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PyPlanLog {
    pub cycle_number: u32,
    pub day_index: u32,
    pub session_order_index: u32,
    pub exercise_order_index: u32,
    pub set_index: u32,
    pub set: PyLoggedSet,
}

#[pymethods]
impl PyPlanLog {
    /// The planned set's natural key — the wrapper follows `set_logs.planned_set_id` to it — and the
    /// logged set, with body weight on its date already resolved.
    #[new]
    const fn new(
        cycle_number: u32,
        day_index: u32,
        session_order_index: u32,
        exercise_order_index: u32,
        set_index: u32,
        set: PyLoggedSet,
    ) -> Self {
        Self {
            cycle_number,
            day_index,
            session_order_index,
            exercise_order_index,
            set_index,
            set,
        }
    }
}

impl From<PyPlanLog> for PlanLog {
    fn from(log: PyPlanLog) -> Self {
        Self {
            cycle_number: log.cycle_number,
            day_index: log.day_index,
            session_order_index: log.session_order_index,
            exercise_order_index: log.exercise_order_index,
            set_index: log.set_index,
            set: log.set.into(),
        }
    }
}

/// An outcome `reconcile` acted on. Mirrors [`SlotOutcome`].
#[pyclass(
    name = "SlotOutcome",
    frozen,
    get_all,
    skip_from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PySlotOutcome {
    pub cycle_number: u32,
    pub exercise_id: String,
    pub occurrence: u32,
    pub outcome: PyOutcome,
    pub open_loop: bool,
}

impl From<SlotOutcome> for PySlotOutcome {
    fn from(outcome: SlotOutcome) -> Self {
        Self {
            cycle_number: outcome.cycle_number,
            exercise_id: outcome.exercise_id,
            occurrence: outcome.occurrence,
            outcome: outcome.outcome.into(),
            open_loop: outcome.open_loop,
        }
    }
}

/// What `reconcile` returns. Mirrors [`Reconciled`].
#[pyclass(
    name = "Reconciled",
    frozen,
    get_all,
    skip_from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq)]
pub struct PyReconciled {
    pub cycles: Vec<PyPlanCycle>,
    pub outcomes: Vec<PySlotOutcome>,
}

/// How one planned exercise went, from its planned sets and the sets logged against them (01 §3.4).
#[pyfunction]
fn classify(planned: Vec<PyPlanSet>, logs: Vec<PyPlanLog>) -> PyOutcome {
    let planned: Vec<PlanSet> = planned.into_iter().map(Into::into).collect();
    let logs: Vec<PlanLog> = logs.into_iter().map(Into::into).collect();
    core_classify(&planned, &logs).into()
}

/// Re-project the plan from what was logged, as of `today` (days since 1970-01-01).
#[pyfunction]
fn reconcile(
    mesocycle: PyMesocycleSpec,
    plan: Vec<PyPlanCycle>,
    logs: Vec<PyPlanLog>,
    today: EpochDay,
) -> PyReconciled {
    let plan: Vec<PlanCycle> = plan.into_iter().map(Into::into).collect();
    let logs: Vec<PlanLog> = logs.into_iter().map(Into::into).collect();
    let reconciled = core_reconcile(&mesocycle.mesocycle, &plan, &logs, today);
    PyReconciled {
        cycles: reconciled.cycles.into_iter().map(Into::into).collect(),
        outcomes: reconciled.outcomes.into_iter().map(Into::into).collect(),
    }
}

// ── Block edits (task 005 stage 3b) ──────────────────────────────────────────────────────────────

create_exception!(
    cyberathlete_core,
    PlanRefused,
    PyValueError,
    "A block edit the engine refused. `args` is `(reason, cycle_number, day_index)`: the reason's name \
     (`started`, `locked`, `history`, `session_does_not_fit`, `newer_engine`, `out_of_range`, \
     `no_such_cycle`, `no_such_exercise`), the cycle that stopped it, and the session that would not fit."
);

fn refused(refusal: Refusal) -> PyErr {
    PlanRefused::new_err((
        refusal.reason.name(),
        refusal.cycle_number,
        refusal.day_index,
    ))
}

fn plan_to_core(plan: Vec<PyPlanCycle>) -> Vec<PlanCycle> {
    plan.into_iter().map(Into::into).collect()
}

fn logs_to_core(logs: Vec<PyPlanLog>) -> Vec<PlanLog> {
    logs.into_iter().map(Into::into).collect()
}

fn plan_to_py(plan: Vec<PlanCycle>) -> Vec<PyPlanCycle> {
    plan.into_iter().map(Into::into).collect()
}

/// What `shorten` returns. Mirrors [`Shortened`].
#[pyclass(
    name = "Shortened",
    frozen,
    get_all,
    skip_from_py_object,
    module = "cyberathlete_core"
)]
#[derive(Debug, Clone, PartialEq)]
pub struct PyShortened {
    pub cycles: Vec<PyPlanCycle>,
    pub dropped: Vec<u32>,
}

/// Lengthen a block to `to` cycles, changing nothing before the first new one (FR-3.1c).
#[pyfunction]
fn extend(
    mesocycle: PyMesocycleSpec,
    plan: Vec<PyPlanCycle>,
    logs: Vec<PyPlanLog>,
    today: EpochDay,
    to: u32,
) -> PyResult<Vec<PyPlanCycle>> {
    core_extend(
        &mesocycle.mesocycle,
        &plan_to_core(plan),
        &logs_to_core(logs),
        today,
        to,
    )
    .map(plan_to_py)
    .map_err(refused)
}

/// Shorten a block to `to` cycles; the dropped cycle numbers are for the caller to archive (INV-11).
#[pyfunction]
fn shorten(plan: Vec<PyPlanCycle>, logs: Vec<PyPlanLog>, to: u32) -> PyResult<PyShortened> {
    core_shorten(&plan_to_core(plan), &logs_to_core(logs), to)
        .map(|it: Shortened| PyShortened {
            cycles: plan_to_py(it.cycles),
            dropped: it.dropped,
        })
        .map_err(refused)
}

/// Give one cycle a length of `days`; every later start follows it (FR-3.1a).
#[pyfunction]
fn relength(
    plan: Vec<PyPlanCycle>,
    logs: Vec<PyPlanLog>,
    cycle_number: u32,
    days: u32,
) -> PyResult<Vec<PyPlanCycle>> {
    core_relength(&plan_to_core(plan), &logs_to_core(logs), cycle_number, days)
        .map(plan_to_py)
        .map_err(refused)
}

/// Put `rule` on one exercise from `from_cycle` on, and reconcile — the preview and the commit are this
/// same call (FR-3.6a).
#[pyfunction]
#[expect(
    clippy::too_many_arguments,
    reason = "reconcile's four arguments and the edit's four; Python names them at the call site"
)]
#[pyo3(signature = (mesocycle, plan, logs, today, exercise_id, occurrence, from_cycle, rule))]
fn switch_rule(
    mesocycle: PyMesocycleSpec,
    plan: Vec<PyPlanCycle>,
    logs: Vec<PyPlanLog>,
    today: EpochDay,
    exercise_id: &str,
    occurrence: u32,
    from_cycle: u32,
    rule: PyProgressionRule,
) -> PyResult<PyReconciled> {
    core_switch_rule(
        &mesocycle.mesocycle,
        &plan_to_core(plan),
        &logs_to_core(logs),
        today,
        exercise_id,
        occurrence,
        from_cycle,
        &rule.rule,
    )
    .map(|reconciled| PyReconciled {
        cycles: plan_to_py(reconciled.cycles),
        outcomes: reconciled.outcomes.into_iter().map(Into::into).collect(),
    })
    .map_err(refused)
}

#[pymodule]
fn _core(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_class::<PyRoundingMode>()?;
    module.add_function(wrap_pyfunction!(round_to_increment, module)?)?;
    module.add_function(wrap_pyfunction!(core_version, module)?)?;

    module.add_class::<PySetType>()?;
    module.add_class::<PyLoggedSet>()?;
    module.add_class::<PyPrKind>()?;
    module.add_class::<PyRepsAtWeight>()?;
    module.add_class::<PyPersonalBests>()?;
    module.add_class::<PyPrAchievement>()?;
    module.add_function(wrap_pyfunction!(is_counted_set, module)?)?;
    module.add_function(wrap_pyfunction!(load_kg, module)?)?;
    module.add_function(wrap_pyfunction!(e1rm, module)?)?;
    module.add_function(wrap_pyfunction!(e1rm_series, module)?)?;
    module.add_function(wrap_pyfunction!(volume_kg, module)?)?;
    module.add_function(wrap_pyfunction!(counted_set_count, module)?)?;
    module.add_function(wrap_pyfunction!(detect_prs, module)?)?;
    module.add_function(wrap_pyfunction!(personal_bests, module)?)?;
    module.add_class::<PyStandingRecord>()?;
    module.add_function(wrap_pyfunction!(standing_records, module)?)?;
    module.add_class::<PySessionMetrics>()?;
    module.add_function(wrap_pyfunction!(session_metrics, module)?)?;
    module.add_class::<PyTracking>()?;
    module.add_class::<PySetEntry>()?;
    module.add_function(wrap_pyfunction!(missing_for_completion, module)?)?;

    module.add("ENGINE_VERSION", ENGINE_VERSION)?;
    module.add_class::<PyProgressionStrategy>()?;
    module.add_class::<PyProgressionRule>()?;
    module.add_class::<PyCycleOneSet>()?;
    module.add_class::<PyExerciseSpec>()?;
    module.add_class::<PySessionSpec>()?;
    module.add_class::<PyMesocycleSpec>()?;
    module.add_class::<PyPlannedSet>()?;
    module.add_class::<PyPlannedExercise>()?;
    module.add_class::<PyPlannedSession>()?;
    module.add_class::<PyPlannedMicrocycle>()?;
    module.add_function(wrap_pyfunction!(generate, module)?)?;
    module.add_function(wrap_pyfunction!(resolve_dates, module)?)?;

    module.add_class::<PyCycleStatus>()?;
    module.add_class::<PyWriteKind>()?;
    module.add_class::<PySetOrigin>()?;
    module.add_class::<PyOutcome>()?;
    module.add_class::<PyPlanSet>()?;
    module.add_class::<PyPlanExercise>()?;
    module.add_class::<PyPlanSession>()?;
    module.add_class::<PyPlanCycle>()?;
    module.add_class::<PyPlanLog>()?;
    module.add_class::<PySlotOutcome>()?;
    module.add_class::<PyReconciled>()?;
    module.add_function(wrap_pyfunction!(classify, module)?)?;
    module.add_function(wrap_pyfunction!(reconcile, module)?)?;

    module.add("PlanRefused", module.py().get_type::<PlanRefused>())?;
    module.add_class::<PyShortened>()?;
    module.add_function(wrap_pyfunction!(extend, module)?)?;
    module.add_function(wrap_pyfunction!(shorten, module)?)?;
    module.add_function(wrap_pyfunction!(relength, module)?)?;
    module.add_function(wrap_pyfunction!(switch_rule, module)?)?;
    Ok(())
}
