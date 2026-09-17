//! The core, as a Python extension module — the server half of [ADR-004](../../../../docs/decisions/ADR-004.md).
//!
//! This crate holds no logic. It translates types at the boundary and calls
//! [`cyberathlete_core`], so that the server and the phone run the same arithmetic rather than two
//! implementations that agree until they do not (INV-10).
//!
//! The boundary carries plain data — floats and a C-like enum — which is where PyO3 interop is
//! pleasant rather than painful, and is the rule ADR-004 sets for keeping it that way.

use cyberathlete_core::{RoundingMode, round_to_increment as core_round_to_increment};
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

#[pymodule]
fn _core(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_class::<PyRoundingMode>()?;
    module.add_function(wrap_pyfunction!(round_to_increment, module)?)?;
    module.add_function(wrap_pyfunction!(core_version, module)?)?;
    Ok(())
}
