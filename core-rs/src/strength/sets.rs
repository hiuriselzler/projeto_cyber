//! INV-04 — only working sets count.
//!
//! This is the predicate the invariant names, and it exists exactly once. A `WHERE set_type IN
//! (...)` in a query, or a filter inside a chart, is the same rule written a second time, and the
//! second copy is the one that will be missed when a set type is added.

use super::LoggedSet;

/// How a set was performed. The five values of the schema's `set_type_enum` (03 §4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SetType {
    /// Recorded, never counted: it is preparation, not work.
    Warmup,
    Working,
    /// Recorded, never counted: load dropped mid-set after the working set it hangs off.
    Drop,
    /// Recorded, never counted: deliberate back-off volume after the top set.
    Backoff,
    /// Counted. A set taken to as many reps as possible is work by any reading.
    Amrap,
}

impl SetType {
    /// The name this type carries in the database, the shared fixtures and both bindings.
    #[must_use]
    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "warmup" => Some(Self::Warmup),
            "working" => Some(Self::Working),
            "drop" => Some(Self::Drop),
            "backoff" => Some(Self::Backoff),
            "amrap" => Some(Self::Amrap),
            _ => None,
        }
    }

    /// The inverse of [`SetType::from_name`].
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Warmup => "warmup",
            Self::Working => "working",
            Self::Drop => "drop",
            Self::Backoff => "backoff",
            Self::Amrap => "amrap",
        }
    }
}

/// Whether a set *type* counts toward volume, PRs and set counts (INV-04).
///
/// Split out from [`is_counted_set`] so that the invariant's own rule — which types count — can be
/// asked about a type alone, by a UI drawing a badge or a fixture listing all five. It deliberately
/// says nothing about completion.
#[must_use]
pub const fn is_counted_type(set_type: SetType) -> bool {
    matches!(set_type, SetType::Working | SetType::Amrap)
}

/// Whether a logged set counts toward volume totals, PR detection, per-microcycle set counts and
/// every progression decision (INV-04).
///
/// Two conditions, not one. The invariant's own rule is the set *type*; the second is completion,
/// because a `set_logs` row exists from the moment a set is planned or pre-filled from a routine
/// and long before anyone lifts it. Counting an untouched row would inflate every total on the
/// screen the user is looking at while they train.
#[must_use]
pub const fn is_counted_set(set: &LoggedSet) -> bool {
    set.is_completed && is_counted_type(set.set_type)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn working_and_amrap_count_and_the_other_three_do_not() {
        // INV-04 in one assertion, and the reason this predicate is not a query filter.
        assert!(is_counted_type(SetType::Working));
        assert!(is_counted_type(SetType::Amrap));
        assert!(!is_counted_type(SetType::Warmup));
        assert!(!is_counted_type(SetType::Drop));
        assert!(!is_counted_type(SetType::Backoff));
    }

    #[test]
    fn an_incomplete_set_never_counts_whatever_its_type() {
        for set_type in [SetType::Working, SetType::Amrap] {
            let set = LoggedSet {
                set_type,
                is_completed: false,
                ..LoggedSet::working(40.0, 6, Some(2))
            };
            assert!(!is_counted_set(&set), "{set_type:?}");
        }
    }

    #[test]
    fn a_completed_warmup_still_does_not_count() {
        // The acceptance criterion: warm-ups appear in the log and in no total.
        let set = LoggedSet {
            set_type: SetType::Warmup,
            ..LoggedSet::working(20.0, 10, Some(5))
        };
        assert!(!is_counted_set(&set));
    }

    #[test]
    fn type_names_round_trip() {
        for set_type in [
            SetType::Warmup,
            SetType::Working,
            SetType::Drop,
            SetType::Backoff,
            SetType::Amrap,
        ] {
            assert_eq!(SetType::from_name(set_type.name()), Some(set_type));
        }
        assert_eq!(SetType::from_name("myoreps"), None);
    }
}
