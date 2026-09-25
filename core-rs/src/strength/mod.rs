//! Strength: e1RM, what counts, tonnage and personal records.
//!
//! The core's first real residents ([ADR-004](../../../docs/decisions/ADR-004.md) § Outcome). Every
//! total on every screen, on the phone and on the server, comes through here — which is the whole
//! point of INV-04 and INV-07 naming *one* predicate and *one* formula.
//!
//! **What this module does not do, deliberately.** It resolves no body weight and reads no
//! microcycle: `body_weight_kg` and `is_deload` arrive on [`LoggedSet`] already looked up by the
//! caller, because looking them up is I/O and I/O does not live here (INV-10). Per-muscle
//! attribution (FR-2.16) belongs here too by the responsibility map, but it is reported *per
//! microcycle* and there are no microcycles until
//! [task 005](../../../docs/tasks/005-strength-progression-planner.md); it arrives with them.

mod e1rm;
mod prs;
mod sets;
mod volume;

pub use e1rm::{MAX_EFFECTIVE_REPS, e1rm, e1rm_series, load_kg};
pub use prs::{PersonalBests, PrAchievement, PrKind, RepsAtWeight, detect_prs, personal_bests};
pub use sets::{SetType, is_counted_set, is_counted_type};
pub use volume::{counted_set_count, volume_kg};

/// One set as it was logged, with everything the core needs to judge it already resolved.
///
/// The two resolved fields are the interesting ones. `body_weight_kg` is the latest
/// `body_weight_log` entry **on or before this set's `local_date`** — not today's, or every
/// historical pull-up's e1RM would move each time the user weighed in (INV-07, INV-17). `is_deload`
/// is its microcycle's flag, and it is what keeps a deload out of a PR celebration (INV-08).
///
/// Both are the caller's job precisely because both are queries. Handing them in keeps this module
/// a pure function of its arguments, which is what lets the phone and the server agree (INV-10).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LoggedSet {
    pub set_type: SetType,
    /// A row exists from the moment the set is planned; only a completed one is a performance.
    pub is_completed: bool,
    /// **Added** load for a bodyweight exercise, total load for any other. Never a display unit:
    /// storage is SI and conversion happens in the app's formatting module alone (INV-01).
    pub weight_kg: Option<f64>,
    pub reps: Option<u32>,
    /// `None` is "not recorded" and is never read as 0 (INV-03).
    pub rir: Option<u32>,
    /// `exercises.uses_bodyweight` — whether the lifter's own weight is part of the load.
    pub uses_bodyweight: bool,
    /// Body weight on or before this set's date, or `None` if none was ever logged by then.
    pub body_weight_kg: Option<f64>,
    /// Whether this set's microcycle is a deload (INV-08). Always `false` until task 005 exists,
    /// which is why task 004 wires the predicate rather than waiting for it.
    pub is_deload: bool,
}

impl LoggedSet {
    /// A completed working set of an ordinary exercise — the shape most tests want, so that a test
    /// about RIR does not have to spell out body weight to say nothing about it.
    #[must_use]
    pub const fn working(weight_kg: f64, reps: u32, rir: Option<u32>) -> Self {
        Self {
            set_type: SetType::Working,
            is_completed: true,
            weight_kg: Some(weight_kg),
            reps: Some(reps),
            rir,
            uses_bodyweight: false,
            body_weight_kg: None,
            is_deload: false,
        }
    }
}
