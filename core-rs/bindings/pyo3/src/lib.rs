//! The core, as a Python extension module — the server half of [ADR-004](../../../../docs/decisions/ADR-004.md).
//!
//! This crate holds no logic. It translates types at the boundary and calls
//! [`cyberathlete_core`], so that the server and the phone run the same arithmetic rather than two
//! implementations that agree until they do not (INV-10).
//!
//! The boundary carries plain data — floats and a C-like enum — which is where PyO3 interop is
//! pleasant rather than painful, and is the rule ADR-004 sets for keeping it that way.

use cyberathlete_core::{
    LoggedSet, PersonalBests, PrAchievement, PrKind, RepsAtWeight, RoundingMode, SetType,
    counted_set_count as core_counted_set_count, detect_prs as core_detect_prs, e1rm as core_e1rm,
    e1rm_series as core_e1rm_series, is_counted_set as core_is_counted_set,
    load_kg as core_load_kg, round_to_increment as core_round_to_increment,
    volume_kg as core_volume_kg,
};
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
    Ok(())
}
