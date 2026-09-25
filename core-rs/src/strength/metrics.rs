//! Per-session metrics â€” what an exercise's history charts plot (FR-2.14, task 004 stage 7).
//!
//! "The top set of a session" and "its best e1RM" read like presentation, but each is an aggregation
//! over what counts (INV-04) of a value only the core may compute (INV-07). Written in a chart they
//! would be the second copy both invariants forbid, so they are here, beside the totals.
//!
//! **Deload sets are in.** INV-08 keeps a deload out of PR detection and "best ever" comparisons, and
//! says they are "stored and charted normally" â€” a chart is a record of what was done, not a
//! celebration of it.

use super::{LoggedSet, counted_set_count, e1rm, is_counted_set, load_kg};

/// One session of one exercise, reduced to the numbers its history shows.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SessionMetrics {
    /// The heaviest load of any counted set, lifter included for a bodyweight exercise. `None` when
    /// no counted set has a known load.
    pub top_load_kg: Option<f64>,
    /// The highest e1RM of any counted set. `None` when none has one â€” no RIR, no load, or past
    /// Epley's range â€” and a chart draws a gap there, never a zero (INV-03, INV-07).
    pub best_e1rm_kg: Option<f64>,
    /// Tonnage of the counted sets. `None` when no counted set has both a load and reps: there is no
    /// number to plot, and a zero would say "trained and moved nothing", which nobody did.
    pub volume_kg: Option<f64>,
    /// How many sets counted (INV-04).
    pub counted_sets: u32,
}

/// [`SessionMetrics`] for each session, in the order given â€” one crossing of the boundary for a
/// whole history, since on the phone each call is a JSI hop.
#[must_use]
pub fn session_metrics(sessions: &[Vec<LoggedSet>]) -> Vec<SessionMetrics> {
    sessions.iter().map(|session| metrics_of(session)).collect()
}

fn metrics_of(session: &[LoggedSet]) -> SessionMetrics {
    let mut top_load_kg: Option<f64> = None;
    let mut best_e1rm_kg: Option<f64> = None;
    let mut volume_kg: Option<f64> = None;

    // In the order given, so the tonnage sums to the bit what `volume_kg` sums (INV-10).
    for set in session.iter().filter(|set| is_counted_set(set)) {
        let load = load_kg(set);
        top_load_kg = max(top_load_kg, load);
        best_e1rm_kg = max(best_e1rm_kg, e1rm(set));
        if let (Some(load), Some(reps)) = (load, set.reps) {
            volume_kg = Some(volume_kg.unwrap_or(0.0) + load * f64::from(reps));
        }
    }

    SessionMetrics {
        top_load_kg,
        best_e1rm_kg,
        volume_kg,
        counted_sets: counted_set_count(session),
    }
}

/// The larger of two values that may not exist.
fn max(current: Option<f64>, candidate: Option<f64>) -> Option<f64> {
    match (current, candidate) {
        (Some(current), Some(candidate)) => Some(current.max(candidate)),
        (current, candidate) => current.or(candidate),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::strength::{SetType, volume_kg};

    fn metrics(session: &[LoggedSet]) -> SessionMetrics {
        session_metrics(&[session.to_vec()])[0]
    }

    #[test]
    fn one_metric_per_session_in_order() {
        let sessions = vec![
            vec![LoggedSet::working(100.0, 5, Some(2))],
            vec![],
            vec![LoggedSet::working(80.0, 8, None)],
        ];
        let all = session_metrics(&sessions);
        assert_eq!(all.len(), 3);
        assert_eq!(all[0].top_load_kg, Some(100.0));
        assert_eq!(all[1].top_load_kg, None);
        assert_eq!(all[2].top_load_kg, Some(80.0));
    }

    #[test]
    fn a_warm_up_is_in_the_log_and_out_of_every_metric() {
        // INV-04: the heaviest set of the day was a warm-up, and it is not the top set.
        let session = [
            LoggedSet {
                set_type: SetType::Warmup,
                ..LoggedSet::working(140.0, 3, Some(5))
            },
            LoggedSet::working(100.0, 5, Some(2)),
        ];
        let got = metrics(&session);
        assert_eq!(got.top_load_kg, Some(100.0));
        assert_eq!(got.best_e1rm_kg, e1rm(&session[1]));
        assert_eq!(got.volume_kg, Some(500.0));
        assert_eq!(got.counted_sets, 1);
    }

    #[test]
    fn a_blank_rir_is_a_gap_in_the_e1rm_never_a_zero() {
        let got = metrics(&[LoggedSet::working(100.0, 5, None)]);
        assert_eq!(got.best_e1rm_kg, None);
        assert_eq!(got.top_load_kg, Some(100.0));
    }

    #[test]
    fn the_best_e1rm_is_the_best_set_s_not_the_heaviest_s() {
        let session = [
            LoggedSet::working(110.0, 1, Some(0)),
            LoggedSet::working(100.0, 6, Some(2)),
        ];
        let got = metrics(&session);
        assert_eq!(got.top_load_kg, Some(110.0));
        assert_eq!(got.best_e1rm_kg, e1rm(&session[1]));
    }

    #[test]
    fn a_deload_is_charted_normally() {
        // INV-08 excludes it from records, not from the history.
        let got = metrics(&[LoggedSet {
            is_deload: true,
            ..LoggedSet::working(60.0, 5, Some(4))
        }]);
        assert_eq!(got.top_load_kg, Some(60.0));
        assert_eq!(got.volume_kg, Some(300.0));
        assert_eq!(got.counted_sets, 1);
    }

    #[test]
    fn a_session_with_nothing_measurable_has_no_numbers_and_says_so() {
        // Only warm-ups; and a counted set with no load (a reps-only exercise, or nothing typed).
        let got = metrics(&[
            LoggedSet {
                set_type: SetType::Warmup,
                ..LoggedSet::working(40.0, 10, None)
            },
            LoggedSet {
                weight_kg: None,
                ..LoggedSet::working(0.0, 12, None)
            },
        ]);
        assert_eq!(got.top_load_kg, None);
        assert_eq!(got.best_e1rm_kg, None);
        assert_eq!(got.volume_kg, None);
        assert_eq!(got.counted_sets, 1);
    }

    #[test]
    fn a_bodyweight_session_is_measured_on_total_load() {
        let got = metrics(&[LoggedSet {
            uses_bodyweight: true,
            body_weight_kg: Some(80.0),
            ..LoggedSet::working(20.0, 5, Some(2))
        }]);
        assert_eq!(got.top_load_kg, Some(100.0));
        assert_eq!(got.volume_kg, Some(500.0));
    }

    #[test]
    fn the_volume_is_exactly_volume_kg_whenever_there_is_one() {
        // One definition of tonnage (INV-04): the metric may only add "there was none" to it.
        let session = [
            LoggedSet::working(62.5, 8, Some(2)),
            LoggedSet {
                set_type: SetType::Drop,
                ..LoggedSet::working(40.0, 12, None)
            },
            LoggedSet::working(62.5, 7, None),
            LoggedSet {
                is_completed: false,
                ..LoggedSet::working(62.5, 6, None)
            },
        ];
        assert_eq!(metrics(&session).volume_kg, Some(volume_kg(&session)));
    }
}
