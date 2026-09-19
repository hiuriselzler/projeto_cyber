//! INV-07 — one canonical e1RM formula.
//!
//! ```text
//! if rir IS NULL:  e1RM = NULL
//! load_kg        = weight_kg                                  -- ordinary exercise
//!                | body_weight_on_or_before(date) + weight_kg -- uses_bodyweight
//! if load_kg IS NULL:  e1RM = NULL
//! effective_reps = reps + rir
//! e1RM           = load_kg × (1 + effective_reps / 30)        -- Epley over effective reps
//! ```
//!
//! Two implementations of this is how the strength graph and the plan come to disagree with nobody
//! able to say which is lying. There is one, here, and both sides call it.
//!
//! **The function is total.** It returns `None` rather than raising, everywhere — INV-07 says "no
//! e1RM" must be a defined case in the engine and never an exception, because `percent_1rm` meets
//! that `None` mid-projection and has to carry on (FR-3.2c).

use super::LoggedSet;

/// Epley's divisor. Named rather than inlined so the formula below reads as the invariant writes it.
const EPLEY_DIVISOR: f64 = 30.0;

/// Beyond this many effective reps the estimate stops being one, and e1RM is not computed (INV-07).
pub const MAX_EFFECTIVE_REPS: u32 = 12;

/// The load a set actually moved, in kilograms (INV-07, FR-2.15a).
///
/// For a bodyweight exercise that is the lifter plus whatever they hung off themselves. The body
/// weight is the caller's already-resolved value for the set's own date, so weighing in tomorrow
/// never rewrites today (INV-17); `None` there means none was ever logged by that date, and the
/// answer is `None` rather than a guess.
///
/// **A blank added load on a bodyweight exercise is zero, not missing.** An unweighted pull-up is
/// the common case and leaving the weight field alone is how it gets logged; the lifter moved their
/// body weight whatever the field says, so nothing is being invented. That is the opposite case
/// from an ordinary exercise, where a blank weight genuinely is a set nobody recorded the load of.
#[must_use]
pub fn load_kg(set: &LoggedSet) -> Option<f64> {
    let load = if set.uses_bodyweight {
        set.body_weight_kg? + set.weight_kg.unwrap_or(0.0)
    } else {
        set.weight_kg?
    };
    load.is_finite().then_some(load)
}

/// The estimated one-rep max for a single set, or `None` where INV-07 refuses to guess.
///
/// `None` has four causes and they are all the same cause: something needed is not known. No RIR
/// (INV-03 — and a set logged without it visibly costs the user its e1RM, which is the correct
/// incentive); no reps; no resolvable load; or more effective reps than Epley is honest over.
#[must_use]
pub fn e1rm(set: &LoggedSet) -> Option<f64> {
    // `reps + rir` is not an RPE conversion — it is RIR's own definition doing arithmetic (INV-03).
    // Five reps with three left in the tank is a set that would have reached eight at failure, and
    // Epley wants the failure rep count.
    let effective_reps = set.reps?.checked_add(set.rir?)?;
    if effective_reps > MAX_EFFECTIVE_REPS {
        return None;
    }
    let load = load_kg(set)?;
    Some(load * (1.0 + f64::from(effective_reps) / EPLEY_DIVISOR))
}

/// [`e1rm`] over many sets at once, preserving order and length.
///
/// Exists for the callers, not for the maths: an e1RM chart asks this question once per point, and
/// on the client every one of those is a crossing of the FFI boundary. One call carrying a hundred
/// sets is cheap where a hundred calls carrying one are not. `None` entries stay `None` — a chart
/// plots a gap there rather than a zero, which is INV-07's whole point.
#[must_use]
pub fn e1rm_series(sets: &[LoggedSet]) -> Vec<Option<f64>> {
    sets.iter().map(e1rm).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::strength::SetType;

    /// Task 004's named acceptance case, to the digit it is written in.
    #[test]
    fn a_weighted_pull_up_at_eighty_plus_twenty_for_five_at_rir_two() {
        let set = LoggedSet {
            uses_bodyweight: true,
            body_weight_kg: Some(80.0),
            ..LoggedSet::working(20.0, 5, Some(2))
        };
        // 100 kg × (1 + 7/30). The criterion quotes 123.3 kg, which is the display rounding; the
        // core hands back the unrounded value and the formatting module is what shortens it.
        assert_eq!(load_kg(&set), Some(100.0));
        assert_eq!(e1rm(&set), Some(100.0 * (1.0 + 7.0 / 30.0)));
        let rounded = (e1rm(&set).unwrap() * 10.0).round() / 10.0;
        assert_eq!(rounded, 123.3);
    }

    #[test]
    fn a_later_weigh_in_cannot_move_a_past_set_s_e1rm() {
        // The second half of the same criterion. Body weight is resolved per set, on or before its
        // own date (INV-17), so a new entry a week later is a different set's input, not this one's.
        let set = LoggedSet {
            uses_bodyweight: true,
            body_weight_kg: Some(80.0),
            ..LoggedSet::working(20.0, 5, Some(2))
        };
        let after_weighing_in = LoggedSet {
            body_weight_kg: Some(84.0),
            ..set
        };
        assert_eq!(e1rm(&set), Some(100.0 * (1.0 + 7.0 / 30.0)));
        assert_eq!(e1rm(&after_weighing_in), Some(104.0 * (1.0 + 7.0 / 30.0)));
        assert_ne!(e1rm(&set), e1rm(&after_weighing_in));
    }

    #[test]
    fn a_bodyweight_set_with_no_body_weight_by_that_date_has_no_e1rm() {
        // The third half of the criterion, and INV-07's no-guessing rule in its second form.
        let set = LoggedSet {
            uses_bodyweight: true,
            body_weight_kg: None,
            ..LoggedSet::working(20.0, 5, Some(2))
        };
        assert_eq!(load_kg(&set), None);
        assert_eq!(e1rm(&set), None);
    }

    #[test]
    fn an_unweighted_bodyweight_set_is_the_lifter_alone() {
        let blank = LoggedSet {
            uses_bodyweight: true,
            body_weight_kg: Some(80.0),
            weight_kg: None,
            ..LoggedSet::working(0.0, 5, Some(2))
        };
        let explicit_zero = LoggedSet {
            weight_kg: Some(0.0),
            ..blank
        };
        assert_eq!(load_kg(&blank), Some(80.0));
        assert_eq!(load_kg(&blank), load_kg(&explicit_zero));
    }

    #[test]
    fn no_rir_means_no_e1rm_and_never_a_zero() {
        // INV-03: NULL and 0 mean opposite things. If this ever returned the RIR-0 answer, every
        // `percent_1rm` prescription downstream would be poisoned by a chip nobody tapped.
        let unrecorded = LoggedSet::working(100.0, 5, None);
        let to_failure = LoggedSet::working(100.0, 5, Some(0));
        assert_eq!(e1rm(&unrecorded), None);
        assert_eq!(e1rm(&to_failure), Some(100.0 * (1.0 + 5.0 / 30.0)));
    }

    #[test]
    fn more_rir_is_a_stronger_performance() {
        // INV-07 says so in as many words, and it is the reason RIR is inside the formula at all.
        let fresh = e1rm(&LoggedSet::working(100.0, 5, Some(3))).unwrap();
        let spent = e1rm(&LoggedSet::working(100.0, 5, Some(0))).unwrap();
        assert!(fresh > spent);
    }

    #[test]
    fn past_twelve_effective_reps_epley_is_not_asked() {
        assert!(e1rm(&LoggedSet::working(60.0, 12, Some(0))).is_some());
        assert!(e1rm(&LoggedSet::working(60.0, 12, Some(1))).is_none());
        // The bound is on reps *plus* RIR, not on reps: twelve reps with five left in the tank is a
        // twelve-rep set only to someone who dropped the RIR.
        assert!(e1rm(&LoggedSet::working(60.0, 8, Some(4))).is_some());
        assert!(e1rm(&LoggedSet::working(60.0, 8, Some(5))).is_none());
    }

    #[test]
    fn a_set_with_no_reps_or_no_load_has_no_e1rm() {
        let no_reps = LoggedSet {
            reps: None,
            ..LoggedSet::working(100.0, 5, Some(2))
        };
        let no_load = LoggedSet {
            weight_kg: None,
            ..LoggedSet::working(100.0, 5, Some(2))
        };
        assert_eq!(e1rm(&no_reps), None);
        assert_eq!(e1rm(&no_load), None);
    }

    #[test]
    fn the_type_of_the_set_is_not_this_function_s_business() {
        // e1RM is arithmetic over a performance; whether that performance *counts* is INV-04's
        // question and is asked separately. Keeping them apart is what stops one leaking into the
        // other — a warm-up has an e1RM, it simply never becomes a PR.
        let warmup = LoggedSet {
            set_type: SetType::Warmup,
            ..LoggedSet::working(100.0, 5, Some(2))
        };
        assert_eq!(e1rm(&warmup), e1rm(&LoggedSet::working(100.0, 5, Some(2))));
    }

    #[test]
    fn a_series_keeps_its_gaps_and_its_order() {
        let sets = [
            LoggedSet::working(100.0, 5, Some(2)),
            LoggedSet::working(100.0, 5, None),
            LoggedSet::working(110.0, 3, Some(1)),
        ];
        let series = e1rm_series(&sets);
        assert_eq!(series.len(), 3);
        assert_eq!(series[1], None);
        assert_eq!(series, sets.iter().map(e1rm).collect::<Vec<_>>());
    }

    #[test]
    fn a_non_finite_load_yields_nothing_rather_than_a_nan() {
        // Across two FFI boundaries a NaN is a value that compares false with itself and poisons
        // every max it reaches. It stops here.
        let set = LoggedSet::working(f64::NAN, 5, Some(2));
        assert_eq!(load_kg(&set), None);
        assert_eq!(e1rm(&set), None);
    }
}
