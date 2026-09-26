//! What a set must hold before it can be completed (03 §4, FR-2.3).
//!
//! 03 §4 says "`is_completed = true` requires the fields its tracking mode needs — enforced in the
//! service layer". Task 004 stage 5c wrote that rule on the phone; stage 8's API needs it too. Two
//! copies — TypeScript on the phone, Python on the server — would be the drift ADR-004 exists to
//! prevent, so the rule lives here once and both bindings call it (task 004 stage 8, decision 2).
//!
//! **Weight is never required.** A blank weight is a bodyweight set or a load the user did not
//! record, and both are real sets. What a mode cannot do without is its measure of the work: reps
//! for the two rep modes, the time for a hold, the distance for a carry.

/// How an exercise is logged — the schema's `tracking_enum` (03 §2, FR-2.3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Tracking {
    /// Weight × reps, with RIR.
    WeightReps,
    /// Reps alone, with RIR — no weight field.
    RepsOnly,
    /// A time alone, and no RIR: reps in reserve is undefined for a hold (INV-03).
    Duration,
    /// Weight · distance · time — a loaded carry, a sled.
    DistanceDuration,
}

impl Tracking {
    /// The name this mode carries in the database, the shared fixtures and both bindings.
    #[must_use]
    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "weight_reps" => Some(Self::WeightReps),
            "reps_only" => Some(Self::RepsOnly),
            "duration" => Some(Self::Duration),
            "distance_duration" => Some(Self::DistanceDuration),
            _ => None,
        }
    }

    /// The inverse of [`Tracking::from_name`].
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::WeightReps => "weight_reps",
            Self::RepsOnly => "reps_only",
            Self::Duration => "duration",
            Self::DistanceDuration => "distance_duration",
        }
    }
}

/// A field a set can be missing. Named as its `set_logs` column, so an API error can point at it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SetField {
    Reps,
    DurationS,
    DistanceM,
}

impl SetField {
    /// The `set_logs` column this field is stored in (03 §4).
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Reps => "reps",
            Self::DurationS => "duration_s",
            Self::DistanceM => "distance_m",
        }
    }
}

/// The measures a set row holds, as typed. Separate from [`super::LoggedSet`], which carries what
/// the strength arithmetic reads and has no time or distance: widening it would change the surface
/// of every function that takes one, for a rule that needs three fields.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct SetEntry {
    pub reps: Option<u32>,
    pub duration_s: Option<u32>,
    pub distance_m: Option<f64>,
}

/// The field a set of this tracking mode is missing before it can be completed, or `None` if it
/// holds everything the mode needs.
///
/// A zero is a value, not a blank: `Some(0)` reps is a failed attempt the user chose to log, and
/// only `None` — nothing typed — is missing (INV-03's rule that absence is never a number).
#[must_use]
pub const fn missing_for_completion(tracking: Tracking, entry: &SetEntry) -> Option<SetField> {
    match tracking {
        Tracking::WeightReps | Tracking::RepsOnly if entry.reps.is_none() => Some(SetField::Reps),
        Tracking::Duration if entry.duration_s.is_none() => Some(SetField::DurationS),
        Tracking::DistanceDuration if entry.distance_m.is_none() => Some(SetField::DistanceM),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL: [Tracking; 4] = [
        Tracking::WeightReps,
        Tracking::RepsOnly,
        Tracking::Duration,
        Tracking::DistanceDuration,
    ];

    #[test]
    fn an_empty_row_is_missing_its_mode_s_own_measure() {
        let empty = SetEntry::default();
        assert_eq!(
            missing_for_completion(Tracking::WeightReps, &empty),
            Some(SetField::Reps)
        );
        assert_eq!(
            missing_for_completion(Tracking::RepsOnly, &empty),
            Some(SetField::Reps)
        );
        assert_eq!(
            missing_for_completion(Tracking::Duration, &empty),
            Some(SetField::DurationS)
        );
        assert_eq!(
            missing_for_completion(Tracking::DistanceDuration, &empty),
            Some(SetField::DistanceM)
        );
    }

    #[test]
    fn a_carry_needs_its_distance_and_not_its_time() {
        // Stage 5c: the ✓ on an empty carry opened the keypad on *Distância*, its required field.
        let timed = SetEntry {
            duration_s: Some(40),
            ..SetEntry::default()
        };
        assert_eq!(
            missing_for_completion(Tracking::DistanceDuration, &timed),
            Some(SetField::DistanceM)
        );
        let walked = SetEntry {
            distance_m: Some(30.48),
            ..SetEntry::default()
        };
        assert_eq!(
            missing_for_completion(Tracking::DistanceDuration, &walked),
            None
        );
    }

    #[test]
    fn zero_reps_is_a_value_not_a_blank() {
        let failed = SetEntry {
            reps: Some(0),
            ..SetEntry::default()
        };
        assert_eq!(missing_for_completion(Tracking::WeightReps, &failed), None);
    }

    #[test]
    fn a_full_row_is_complete_in_every_mode() {
        let full = SetEntry {
            reps: Some(8),
            duration_s: Some(90),
            distance_m: Some(30.0),
        };
        for tracking in ALL {
            assert_eq!(
                missing_for_completion(tracking, &full),
                None,
                "{tracking:?}"
            );
        }
    }

    #[test]
    fn mode_names_round_trip() {
        for tracking in ALL {
            assert_eq!(Tracking::from_name(tracking.name()), Some(tracking));
        }
        assert_eq!(Tracking::from_name("pace"), None);
    }
}
