//! FR-3.1b and FR-3.9 — which cycles are deloads, and what a deload prescribes.
//!
//! Three modes, each a user's choice and none of them a default the engine prefers: `none` is as
//! legitimate as the others, and under it no cycle is ever a deload.

use super::plan::{DeloadPolicy, MesocycleSpec, PlannedSet};
use super::strategies::{Prescriber, clamp};
use super::{BASIS_POINTS, RoundingMode, round_to_increment};
use crate::strength::is_counted_type;

/// FR-3.9: a deload cycle, from the working prescription it multiplies — the last working cycle's, as
/// it stands.
///
/// Fewer working sets — `deload_set_bp` of them, a tie to the fewer, never below one — and every kept
/// set's load cut to `deload_load_bp` and re-anchored with `nearest`, its RIR raised by
/// `deload_rir_bump` and clamped into the rule (INV-05). Warm-up, drop and back-off sets are not counted
/// sets (INV-04), so the reduction leaves them in place; their loads and RIR are deloaded like the rest.
pub(super) fn deload_sets(
    exercise: Prescriber<'_>,
    working: Vec<PlannedSet>,
    spec: &MesocycleSpec,
) -> Vec<PlannedSet> {
    let rule = exercise.rule;
    let counted = working
        .iter()
        .filter(|set| is_counted_type(set.set_type))
        .count();
    let keep = deload_set_count(counted, spec.deload_set_bp);

    let mut kept_counted = 0;
    let mut sets = Vec::with_capacity(working.len());
    for set in working {
        if is_counted_type(set.set_type) {
            if kept_counted == keep {
                continue;
            }
            kept_counted += 1;
        }
        let target_weight_kg = set.target_weight_kg.map(|weight_kg| {
            round_to_increment(
                weight_kg * f64::from(spec.deload_load_bp) / f64::from(BASIS_POINTS),
                exercise.increment_kg,
                RoundingMode::Nearest,
            )
        });
        let raised = set
            .target_rir
            .map(|rir| i64::from(rir) + i64::from(spec.deload_rir_bump));
        let (target_rir, rir_clamped) = clamp(raised, rule.min_rir, rule.max_rir);
        // The reps a deload keeps are the last working cycle's, and after a user's edit those may sit
        // outside the rule — which the user may do, and the engine may not repeat (INV-05).
        let (target_reps, reps_clamped) =
            clamp(set.target_reps.map(i64::from), rule.min_reps, rule.max_reps);
        sets.push(PlannedSet {
            target_weight_kg,
            target_reps,
            target_rir,
            was_clamped: set.was_clamped || rir_clamped || reps_clamped,
            ..set
        });
    }
    sets
}

/// How many of `counted` working sets a deload keeps: `set_bp` of them, a tie going to the fewer — the
/// rule ADR-010 gives loads — and never below one, so a deload never removes an exercise. Never more
/// than there were, whatever `set_bp` says. Integer arithmetic throughout (INV-10).
pub(super) fn deload_set_count(counted: usize, set_bp: u32) -> usize {
    if counted == 0 {
        return 0;
    }
    let scaled = u64::try_from(counted)
        .unwrap_or(u64::MAX)
        .saturating_mul(u64::from(set_bp));
    let whole = scaled / u64::from(BASIS_POINTS);
    let remainder = scaled % u64::from(BASIS_POINTS);
    // `>`, not `>=`: exactly half a set goes to the fewer.
    let rounded = if remainder * 2 > u64::from(BASIS_POINTS) {
        whole + 1
    } else {
        whole
    };
    usize::try_from(rounded)
        .unwrap_or(counted)
        .clamp(1, counted)
}

/// Whether each of cycles 1..=`num_microcycles` is a deload, cycle 1 first.
///
/// **Cycle 1 is never a deload**: it is the user's own baseline (FR-3.3), and every later load is
/// measured from it. So `EveryN { every: 1 }` makes every cycle *after* the first a deload, and a manual
/// flag on cycle 1, or on a cycle past the end of the block, is ignored. `every = 0` names no cycle. The
/// function is total: whatever the policy holds, it answers.
#[must_use]
pub fn deload_schedule(policy: &DeloadPolicy, num_microcycles: u32) -> Vec<bool> {
    (1..=num_microcycles)
        .map(|cycle| cycle > 1 && is_flagged(policy, cycle, num_microcycles))
        .collect()
}

fn is_flagged(policy: &DeloadPolicy, cycle: u32, num_microcycles: u32) -> bool {
    match policy {
        DeloadPolicy::None => false,
        DeloadPolicy::EveryN { every, final_cycle } => {
            // `is_multiple_of(0)` holds only for 0, and a cycle is never 0: `every = 0` names nothing.
            let on_the_beat = cycle.is_multiple_of(*every);
            on_the_beat || (*final_cycle && cycle == num_microcycles)
        }
        DeloadPolicy::Manual { cycles } => cycles.contains(&cycle),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flagged(schedule: &[bool]) -> Vec<u32> {
        (1..)
            .zip(schedule)
            .filter_map(|(cycle, &deload)| deload.then_some(cycle))
            .collect()
    }

    #[test]
    fn none_is_never_a_deload_however_long_the_block() {
        // Task 005: a 24-cycle block with no deload at all is a configuration, not an edge case.
        assert!(flagged(&deload_schedule(&DeloadPolicy::None, 24)).is_empty());
    }

    #[test]
    fn every_six_in_twelve_is_the_owner_s_example() {
        let policy = DeloadPolicy::EveryN {
            every: 6,
            final_cycle: false,
        };
        assert_eq!(flagged(&deload_schedule(&policy, 12)), vec![6, 12]);
    }

    #[test]
    fn the_final_cycle_flag_adds_the_last_cycle_when_the_beat_misses_it() {
        let with = DeloadPolicy::EveryN {
            every: 4,
            final_cycle: true,
        };
        let without = DeloadPolicy::EveryN {
            every: 4,
            final_cycle: false,
        };
        assert_eq!(flagged(&deload_schedule(&with, 10)), vec![4, 8, 10]);
        assert_eq!(flagged(&deload_schedule(&without, 10)), vec![4, 8]);
        // When the beat already lands on the last cycle, the flag changes nothing.
        assert_eq!(flagged(&deload_schedule(&with, 8)), vec![4, 8]);
    }

    #[test]
    fn manual_flags_exactly_the_cycles_named_inside_the_block() {
        let policy = DeloadPolicy::Manual {
            cycles: vec![1, 5, 7, 30],
        };
        assert_eq!(flagged(&deload_schedule(&policy, 8)), vec![5, 7]);
    }

    #[test]
    fn cycle_one_is_never_a_deload_and_zero_names_nothing() {
        let every_one = DeloadPolicy::EveryN {
            every: 1,
            final_cycle: false,
        };
        assert_eq!(flagged(&deload_schedule(&every_one, 4)), vec![2, 3, 4]);
        let every_zero = DeloadPolicy::EveryN {
            every: 0,
            final_cycle: false,
        };
        assert!(flagged(&deload_schedule(&every_zero, 4)).is_empty());
    }
}
