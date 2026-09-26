//! 01 §3.4 — how a planned exercise went: `Exceeded`, `Met`, `Under` or `Missed`.
//!
//! The table in 01 §3.4 left a gap — reps below the target but at or above `min_reps` — and task 005
//! stage 3 closed it: **`Met` needs every counted set at its target; anything short is `Under`**, so the
//! rule's `failure_policy` decides what happens next, as a lifter would after a missed rep.

use super::plan::{Outcome, PlanLog, PlanSet};
use crate::strength::is_counted_type;

/// Classify one planned exercise from its planned sets and the sets logged against them.
///
/// Only counted sets are judged (INV-04), each against the log whose `set_index` it carries — the
/// wrapper has already matched them through `planned_set_id` (FR-3.15), and a set logged against no
/// planned set never arrives here (FR-3.16).
///
/// - **`Missed`** when nothing at all was logged against the exercise. Whether that is a missed
///   *session* or an exercise skipped inside a logged one is the caller's to say: `reconcile` reads the
///   second as `Under`, because a planned set with no completed log fell short.
/// - **`Under`** when any counted set was not completed, fell short of its target reps, or was logged at
///   RIR 0 when its target left two or more in reserve.
/// - **`Exceeded`** when every counted set met its target and each was logged at least two reps in
///   reserve above its target RIR. A set without a logged or a target RIR carries no signal, so it can
///   never make an exercise `Exceeded`, and never `Under` by the RIR clause (INV-03).
/// - **`Met`** otherwise — including an exercise with no counted set to judge.
#[must_use]
pub fn classify(planned: &[PlanSet], logs: &[PlanLog]) -> Outcome {
    if logs.is_empty() {
        return Outcome::Missed;
    }

    let mut every_set_ahead = true;
    let mut counted_sets = 0_usize;
    for set in planned.iter().filter(|set| is_counted_type(set.set_type)) {
        counted_sets += 1;
        let Some(logged) = logs
            .iter()
            .find(|log| log.set_index == set.set_index && log.set.is_completed)
            .map(|log| log.set)
        else {
            return Outcome::Under;
        };
        let reps_met = set
            .target_reps
            .is_none_or(|target| logged.reps.is_some_and(|reps| reps >= target));
        let to_failure_against_a_reserve =
            logged.rir == Some(0) && set.target_rir.is_some_and(|target| target >= 2);
        if !reps_met || to_failure_against_a_reserve {
            return Outcome::Under;
        }
        let ahead = set
            .target_rir
            .zip(logged.rir)
            .is_some_and(|(target, rir)| rir >= target.saturating_add(2));
        every_set_ahead &= ahead;
    }

    if counted_sets > 0 && every_set_ahead {
        Outcome::Exceeded
    } else {
        Outcome::Met
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progression::plan::SetOrigin;
    use crate::strength::{LoggedSet, SetType};

    fn planned(set_index: u32, reps: u32, rir: Option<u32>) -> PlanSet {
        PlanSet {
            set_index,
            set_type: SetType::Working,
            target_weight_kg: Some(40.0),
            target_reps: Some(reps),
            target_min_reps: None,
            target_max_reps: None,
            target_rir: rir,
            was_clamped: false,
            origin: SetOrigin::Generated,
            is_pinned: false,
        }
    }

    fn logged(set_index: u32, reps: u32, rir: Option<u32>) -> PlanLog {
        PlanLog {
            cycle_number: 1,
            day_index: 1,
            session_order_index: 0,
            exercise_order_index: 0,
            set_index,
            set: LoggedSet::working(40.0, reps, rir),
        }
    }

    #[test]
    fn every_set_on_target_is_met() {
        let plan = [planned(0, 6, Some(3)), planned(1, 6, Some(3))];
        let logs = [logged(0, 6, Some(3)), logged(1, 7, Some(4))];
        assert_eq!(classify(&plan, &logs), Outcome::Met);
    }

    #[test]
    fn every_set_two_in_reserve_above_target_is_exceeded() {
        let plan = [planned(0, 6, Some(3)), planned(1, 6, Some(3))];
        let logs = [logged(0, 6, Some(5)), logged(1, 6, Some(6))];
        assert_eq!(classify(&plan, &logs), Outcome::Exceeded);
        // One set only one above is not enough.
        let logs = [logged(0, 6, Some(5)), logged(1, 6, Some(4))];
        assert_eq!(classify(&plan, &logs), Outcome::Met);
    }

    #[test]
    fn a_rep_short_of_target_is_under_even_above_min_reps() {
        // Stage 3, decision 3: the gap in 01 §3.4 closes on the strict side.
        let plan = [planned(0, 8, Some(2))];
        assert_eq!(classify(&plan, &[logged(0, 7, Some(2))]), Outcome::Under);
    }

    #[test]
    fn failure_against_a_planned_reserve_is_under() {
        let plan = [planned(0, 6, Some(2))];
        assert_eq!(classify(&plan, &[logged(0, 6, Some(0))]), Outcome::Under);
        // …but not when the plan itself asked for failure.
        let plan = [planned(0, 6, Some(1))];
        assert_eq!(classify(&plan, &[logged(0, 6, Some(0))]), Outcome::Met);
    }

    #[test]
    fn a_missing_rir_is_no_signal() {
        // INV-03: never `Exceeded`, never `Under` by the RIR clause — reps alone decide.
        let plan = [planned(0, 6, Some(3))];
        assert_eq!(classify(&plan, &[logged(0, 6, None)]), Outcome::Met);
    }

    #[test]
    fn a_planned_set_left_undone_falls_short() {
        let plan = [planned(0, 6, Some(3)), planned(1, 6, Some(3))];
        assert_eq!(classify(&plan, &[logged(0, 6, Some(3))]), Outcome::Under);
        let mut unfinished = logged(1, 6, Some(3));
        unfinished.set.is_completed = false;
        assert_eq!(
            classify(&plan, &[logged(0, 6, Some(3)), unfinished]),
            Outcome::Under
        );
    }

    #[test]
    fn nothing_logged_is_missed_and_warm_ups_are_not_judged() {
        let mut warmup = planned(0, 6, Some(3));
        warmup.set_type = SetType::Warmup;
        assert_eq!(classify(&[warmup], &[]), Outcome::Missed);
        assert_eq!(
            classify(&[warmup, planned(1, 6, Some(3))], &[logged(1, 6, Some(3))]),
            Outcome::Met
        );
    }
}
