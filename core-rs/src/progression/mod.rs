//! Progression: the strategies, reconciliation, and the load rounding every one of them ends in.
//!
//! Only the rounding exists during the ADR-004 spike. The six strategies and reconciliation are
//! [task 005](../../../docs/tasks/005-strength-progression-planner.md).

mod rounding;

pub use rounding::{RoundingMode, round_to_increment};
