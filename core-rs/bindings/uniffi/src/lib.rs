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

/// Which way a load between two steps is moved. Mirrors [`cyberathlete_core::RoundingMode`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum RoundingMode {
    Nearest,
    Down,
    Up,
}

impl From<RoundingMode> for cyberathlete_core::RoundingMode {
    fn from(mode: RoundingMode) -> Self {
        match mode {
            RoundingMode::Nearest => Self::Nearest,
            RoundingMode::Down => Self::Down,
            RoundingMode::Up => Self::Up,
        }
    }
}

/// Round a load to a multiple of an increment (INV-02).
#[uniffi::export]
pub fn round_to_increment(weight_kg: f64, increment_kg: f64, mode: RoundingMode) -> f64 {
    cyberathlete_core::round_to_increment(weight_kg, increment_kg, mode.into())
}

/// The version of the core this module was built from. **Not** `ENGINE_VERSION`, which stamps a
/// projection (INV-06) and arrives with task 005.
#[uniffi::export]
pub fn core_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}
