//! FR-3.1b and FR-3.9 — which cycles are deloads.
//!
//! Three modes, each a user's choice and none of them a default the engine prefers: `none` is as
//! legitimate as the others, and under it no cycle is ever a deload.

use super::plan::DeloadPolicy;

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
