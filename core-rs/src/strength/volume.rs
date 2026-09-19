//! Tonnage and set counts — every total on every screen, computed once (INV-04).

use super::{LoggedSet, is_counted_set, load_kg};

/// Total tonnage of a group of sets, in kilograms: `load × reps`, summed over counted sets alone.
///
/// For a bodyweight exercise the load includes the lifter (FR-2.15a), so a set of pull-ups is not
/// silently worth zero. A counted set whose load or reps is unknown contributes nothing — there is
/// no number to add, and inventing one here would be INV-07's guess wearing a different hat.
///
/// Sets are summed in the order given so that two runs agree to the bit (INV-10): floating-point
/// addition is not associative, and a total that depends on iteration order is a total the phone
/// and the server can disagree about.
#[must_use]
pub fn volume_kg(sets: &[LoggedSet]) -> f64 {
    let mut total = 0.0;
    for set in sets.iter().filter(|set| is_counted_set(set)) {
        if let (Some(load), Some(reps)) = (load_kg(set), set.reps) {
            total += load * f64::from(reps);
        }
    }
    total
}

/// How many sets counted (INV-04) — what "4 sets of chest" means before any per-muscle weighting.
#[must_use]
pub fn counted_set_count(sets: &[LoggedSet]) -> u32 {
    // `as` would wrap; a workout cannot hold `u32::MAX` sets, but saturating says so without
    // relying on that.
    u32::try_from(sets.iter().filter(|set| is_counted_set(set)).count()).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::strength::SetType;

    fn warmup(weight_kg: f64, reps: u32) -> LoggedSet {
        LoggedSet {
            set_type: SetType::Warmup,
            ..LoggedSet::working(weight_kg, reps, None)
        }
    }

    #[test]
    fn warm_ups_are_in_the_log_and_out_of_every_total() {
        // Task 004's acceptance criterion, stated as arithmetic.
        let sets = [
            warmup(20.0, 10),
            LoggedSet::working(100.0, 5, Some(2)),
            LoggedSet::working(100.0, 5, Some(1)),
        ];
        assert_eq!(volume_kg(&sets), 1000.0);
        assert_eq!(counted_set_count(&sets), 2);
    }

    #[test]
    fn drop_and_backoff_sets_are_recorded_and_uncounted_too() {
        for set_type in [SetType::Drop, SetType::Backoff] {
            let sets = [LoggedSet {
                set_type,
                ..LoggedSet::working(100.0, 5, Some(2))
            }];
            assert_eq!(volume_kg(&sets), 0.0, "{set_type:?}");
            assert_eq!(counted_set_count(&sets), 0, "{set_type:?}");
        }
    }

    #[test]
    fn an_amrap_counts() {
        let sets = [LoggedSet {
            set_type: SetType::Amrap,
            ..LoggedSet::working(100.0, 12, Some(0))
        }];
        assert_eq!(volume_kg(&sets), 1200.0);
        assert_eq!(counted_set_count(&sets), 1);
    }

    #[test]
    fn an_unfinished_set_is_worth_nothing_yet() {
        // The row exists the moment the set is pre-filled from a routine. Counting it would inflate
        // the total on the screen the user is reading mid-workout.
        let sets = [LoggedSet {
            is_completed: false,
            ..LoggedSet::working(100.0, 5, Some(2))
        }];
        assert_eq!(volume_kg(&sets), 0.0);
        assert_eq!(counted_set_count(&sets), 0);
    }

    #[test]
    fn a_bodyweight_set_is_worth_the_lifter_plus_the_load() {
        let sets = [LoggedSet {
            uses_bodyweight: true,
            body_weight_kg: Some(80.0),
            ..LoggedSet::working(20.0, 5, Some(2))
        }];
        assert_eq!(volume_kg(&sets), 500.0);
    }

    #[test]
    fn rir_is_not_an_input_to_tonnage() {
        // Volume is load × reps. A set logged without RIR loses its e1RM (INV-07) and keeps its
        // tonnage — the invariant says so, and the two must not be conflated.
        let with = [LoggedSet::working(100.0, 5, Some(3))];
        let without = [LoggedSet::working(100.0, 5, None)];
        assert_eq!(volume_kg(&with), volume_kg(&without));
        assert_eq!(counted_set_count(&without), 1);
    }

    #[test]
    fn a_counted_set_missing_its_numbers_adds_nothing() {
        let sets = [
            LoggedSet {
                reps: None,
                ..LoggedSet::working(100.0, 5, Some(2))
            },
            LoggedSet {
                weight_kg: None,
                ..LoggedSet::working(100.0, 5, Some(2))
            },
            LoggedSet::working(100.0, 5, Some(2)),
        ];
        assert_eq!(volume_kg(&sets), 500.0);
        // It still *counts* as a set: it was performed, and only its load is unknown.
        assert_eq!(counted_set_count(&sets), 3);
    }

    #[test]
    fn an_empty_workout_totals_zero_rather_than_nothing() {
        assert_eq!(volume_kg(&[]), 0.0);
        assert_eq!(counted_set_count(&[]), 0);
    }

    #[test]
    fn a_deload_set_still_counts_toward_volume() {
        // INV-08 excludes deloads from PR *celebration*, not from the log or the tonnage chart:
        // "stored and charted normally". Getting this backwards would make a deload cycle look
        // like a week off.
        let sets = [LoggedSet {
            is_deload: true,
            ..LoggedSet::working(60.0, 5, Some(4))
        }];
        assert_eq!(volume_kg(&sets), 300.0);
        assert_eq!(counted_set_count(&sets), 1);
    }
}
