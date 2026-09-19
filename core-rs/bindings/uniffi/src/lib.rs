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

// ── Strength (task 004) ───────────────────────────────────────────────────────────────────────────
//
// Everything below is type marshalling. The batch shapes — `volumeKg`, `e1rmSeries`, `detectPrs`
// over a whole list — are here because on this side of the boundary each call is a JSI hop, and a
// set-logging screen or an e1RM chart would otherwise make one per row. The maths is in the core.

/// How a set was performed. Mirrors [`cyberathlete_core::SetType`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum SetType {
    Warmup,
    Working,
    Drop,
    Backoff,
    Amrap,
}

impl From<SetType> for cyberathlete_core::SetType {
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

/// One logged set. Mirrors [`cyberathlete_core::LoggedSet`].
///
/// `bodyWeightKg` and `isDeload` are resolved by the caller, because resolving them is a query and
/// the core does no I/O (INV-10). `rir` is nullable and a null is never a zero (INV-03).
#[derive(Debug, Clone, Copy, PartialEq, uniffi::Record)]
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

impl From<LoggedSet> for cyberathlete_core::LoggedSet {
    fn from(set: LoggedSet) -> Self {
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

fn to_core(sets: Vec<LoggedSet>) -> Vec<cyberathlete_core::LoggedSet> {
    sets.into_iter().map(Into::into).collect()
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
    cyberathlete_core::is_counted_set(&set.into())
}

/// The load a set actually moved, including the lifter for a bodyweight exercise (INV-07).
#[uniffi::export]
pub fn load_kg(set: LoggedSet) -> Option<f64> {
    cyberathlete_core::load_kg(&set.into())
}

/// The estimated one-rep max for one set, or null where INV-07 refuses to guess.
#[uniffi::export]
pub fn e1rm(set: LoggedSet) -> Option<f64> {
    cyberathlete_core::e1rm(&set.into())
}

/// [`e1rm`] over many sets in one crossing of the boundary, order and length preserved.
#[uniffi::export]
pub fn e1rm_series(sets: Vec<LoggedSet>) -> Vec<Option<f64>> {
    cyberathlete_core::e1rm_series(&to_core(sets))
}

/// Total tonnage of the counted sets, in kilograms (INV-04).
#[uniffi::export]
pub fn volume_kg(sets: Vec<LoggedSet>) -> f64 {
    cyberathlete_core::volume_kg(&to_core(sets))
}

/// How many of these sets counted (INV-04).
#[uniffi::export]
pub fn counted_set_count(sets: Vec<LoggedSet>) -> u32 {
    cyberathlete_core::counted_set_count(&to_core(sets))
}

/// Every record the session broke, in the core's fixed order (FR-2.15, INV-08).
#[uniffi::export]
pub fn detect_prs(previous: PersonalBests, session: Vec<LoggedSet>) -> Vec<PrAchievement> {
    cyberathlete_core::detect_prs(&previous.into(), &to_core(session))
        .into_iter()
        .map(Into::into)
        .collect()
}
