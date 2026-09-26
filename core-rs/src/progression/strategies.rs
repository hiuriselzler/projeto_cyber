//! 01 §3.2 — what each strategy prescribes for a working cycle.
//!
//! One function per strategy, each from cycle 1's sets and the cycle's place in the block. **Open-loop**:
//! there are no logs at generation, so each projects as if every working cycle were `Met`. A deload is
//! not here — it multiplies whatever a strategy prescribed last ([`generate`](super::generate)).
//!
//! Every load leaves through the rule's own rounding (INV-02), and every rep and RIR target through the
//! clamp that marks `was_clamped` (INV-05). The rules each strategy follows are written out in 01 §3.2.

use super::plan::{CycleOneSet, ExerciseSpec, LoadStep, PlannedSet, RirMode, Strategy};
use super::{BASIS_POINTS, round_to_increment};
use crate::strength::is_counted_type;

/// Where a working cycle stands in its block.
#[derive(Debug, Clone, Copy)]
pub(super) struct Progress {
    /// Working cycles since cycle 1: cycle 1 is 0, and a deload does not count (01 FR-3.9).
    pub step: u32,
    /// Working cycles in the whole block, cycle 1 included — what `rir_autoregulated` descends across.
    pub working_cycles: u32,
}

/// Every set of `exercise` as a working cycle at `at` prescribes it, in `set_index` order.
pub(super) fn working_sets(exercise: &ExerciseSpec, at: Progress) -> Vec<PlannedSet> {
    let mut sets: Vec<&CycleOneSet> = exercise.sets.iter().collect();
    sets.sort_by_key(|set| set.set_index);

    match &exercise.rule.strategy {
        Strategy::Fixed => sets
            .into_iter()
            .map(|set| held(exercise, set, set.target_weight_kg))
            .collect(),
        Strategy::LinearLoad(step) => sets
            .into_iter()
            .map(|set| {
                let load = set.target_weight_kg.map(|kg| advance(kg, *step, at.step));
                held(exercise, set, load)
            })
            .collect(),
        Strategy::DoubleProgression { step, rep_step } => {
            double_progression(exercise, &sets, *step, *rep_step, at.step)
        }
        Strategy::Percent1rm {
            wave_bp,
            baseline_e1rm_kg,
        } => percent_1rm(exercise, &sets, wave_bp, *baseline_e1rm_kg, at.step),
        Strategy::RirAutoregulated {
            step,
            rir_start,
            rir_end,
        } => rir_autoregulated(exercise, &sets, *step, *rir_start, *rir_end, at),
    }
}

/// Cycle 1's load, `steps` load steps on — before rounding. A basis-point step is a share of cycle 1's
/// load, so it adds a constant amount and never compounds.
fn advance(weight_kg: f64, step: LoadStep, steps: u32) -> f64 {
    match step {
        // Plain multiply and add, never a fused `mul_add`: ADR-010 keeps load arithmetic to operations
        // IEEE-754 defines one way everywhere, and `round_to_increment` absorbs the rest.
        LoadStep::Kg(step_kg) => weight_kg + f64::from(steps) * step_kg,
        // The basis points are summed as integers first, so 140 kg at 250 bp is 140 × 10 250 / 10 000 =
        // 143.5 kg exactly, before `round_to_increment` puts it on the grid at 142.5 kg (ADR-010 §3).
        LoadStep::BasisPoints(bp) => {
            let share = u64::from(BASIS_POINTS) + u64::from(steps) * u64::from(bp);
            weight_kg * exact(share) / f64::from(BASIS_POINTS)
        }
    }
}

/// An integer as a float, exactly: every value passed here is far below 2⁵³, where every integer has an
/// exact `f64`.
const fn exact(value: u64) -> f64 {
    value as f64
}

/// A set carrying cycle 1's reps and RIR, with `load_kg` as its unrounded load.
fn held(exercise: &ExerciseSpec, set: &CycleOneSet, load_kg: Option<f64>) -> PlannedSet {
    prescribed(
        exercise,
        set,
        load_kg,
        set.target_reps,
        set.target_rir.map(i64::from),
    )
}

/// A set with its load rounded by the rule (INV-02) and its reps and RIR clamped into the rule and
/// marked (INV-05). RIR arrives signed, because a ladder's offset may take it below zero before the clamp.
fn prescribed(
    exercise: &ExerciseSpec,
    set: &CycleOneSet,
    load_kg: Option<f64>,
    reps: Option<u32>,
    rir: Option<i64>,
) -> PlannedSet {
    let rule = &exercise.rule;
    let (target_reps, reps_clamped) = clamp(reps.map(i64::from), rule.min_reps, rule.max_reps);
    let (target_rir, rir_clamped) = clamp(rir, rule.min_rir, rule.max_rir);
    PlannedSet {
        set_index: set.set_index,
        set_type: set.set_type,
        target_weight_kg: load_kg
            .map(|kg| round_to_increment(kg, exercise.increment_kg, rule.rounding)),
        target_reps,
        target_min_reps: None,
        target_max_reps: None,
        target_rir,
        was_clamped: reps_clamped || rir_clamped,
    }
}

/// A target clamped into `[low, high]`, and whether clamping changed it (INV-05). `None` stays `None`:
/// no target is not a target of zero (INV-03). Total even if the bounds are inverted.
pub(super) fn clamp(value: Option<i64>, low: u32, high: u32) -> (Option<u32>, bool) {
    value.map_or((None, false), |it| {
        let clamped = it.max(i64::from(low)).min(i64::from(high));
        // Inside `[low, high]`, both `u32`, so the conversion cannot fail.
        let narrowed = u32::try_from(clamped).unwrap_or(high);
        (Some(narrowed), clamped != it)
    })
}

/// 01 §3.2 (b), decision 1 of stage 2: **the exercise moves as one.** Each working cycle, every counted
/// set below the top of the range gains `rep_step` reps, stopping at the top; once every counted set is
/// at the top, the load takes one step and every counted set drops back to the bottom. Warm-up, drop and
/// back-off sets hold their reps, and their loads follow the exercise's steps. A counted set with no rep
/// target starts at the bottom — this strategy owns the reps.
fn double_progression(
    exercise: &ExerciseSpec,
    sets: &[&CycleOneSet],
    step: LoadStep,
    rep_step: u32,
    at: u32,
) -> Vec<PlannedSet> {
    let rule = &exercise.rule;
    let bottom = rule.min_reps;
    let top = rule.max_reps.max(bottom);
    let mut reps: Vec<u32> = sets
        .iter()
        .filter(|set| is_counted_type(set.set_type))
        .map(|set| set.target_reps.unwrap_or(bottom).clamp(bottom, top))
        .collect();

    let mut load_steps = 0_u32;
    for _ in 0..at {
        if !reps.is_empty() && reps.iter().all(|&it| it >= top) {
            load_steps += 1;
            reps.fill(bottom);
        } else {
            for it in &mut reps {
                *it = it.saturating_add(rep_step).min(top);
            }
        }
    }

    let mut counted_reps = reps.into_iter();
    sets.iter()
        .map(|set| {
            let load = set.target_weight_kg.map(|kg| advance(kg, step, load_steps));
            if is_counted_type(set.set_type) {
                let reps = counted_reps.next();
                PlannedSet {
                    target_min_reps: Some(rule.min_reps),
                    target_max_reps: Some(rule.max_reps),
                    ..prescribed(exercise, set, load, reps, set.target_rir.map(i64::from))
                }
            } else {
                held(exercise, set, load)
            }
        })
        .collect()
}

/// 01 §3.2 (c), decisions 2 and 3 of stage 2. Every counted set prescribes `baseline × wave`, the wave
/// tiled across the working cycles with cycle 1 at its first value; warm-up, drop and back-off sets are
/// held as authored. An empty wave holds cycle 1's loads.
///
/// **A bodyweight exercise** prescribes the *added* load: `baseline × wave − body weight`, never below
/// zero. With no body weight, it holds cycle 1's loads rather than guess one (INV-07) — running
/// open-loop, as FR-3.2c has it for a missing e1RM.
fn percent_1rm(
    exercise: &ExerciseSpec,
    sets: &[&CycleOneSet],
    wave_bp: &[u32],
    baseline_e1rm_kg: f64,
    at: u32,
) -> Vec<PlannedSet> {
    let share = usize::try_from(at)
        .ok()
        .and_then(|step| wave_bp.get(step % wave_bp.len().max(1)))
        .copied();
    let wave_load = share.and_then(|bp| {
        let total_kg = baseline_e1rm_kg * f64::from(bp) / f64::from(BASIS_POINTS);
        if exercise.uses_bodyweight {
            exercise
                .body_weight_kg
                .map(|body_kg| (total_kg - body_kg).max(0.0))
        } else {
            Some(total_kg)
        }
    });

    sets.iter()
        .map(|set| {
            let load = if is_counted_type(set.set_type) {
                wave_load.or(set.target_weight_kg)
            } else {
                set.target_weight_kg
            };
            held(exercise, set, load)
        })
        .collect()
}

/// 01 §3.2 (d), decisions 4 and 5 of stage 2. The load climbs a step each working cycle; the counted
/// sets' target RIR descends from `rir_start` to `rir_end` across the working cycles, plus each set's
/// offset under a per-set ladder, clamped and marked. Warm-up, drop and back-off sets keep cycle 1's RIR.
fn rir_autoregulated(
    exercise: &ExerciseSpec,
    sets: &[&CycleOneSet],
    step: LoadStep,
    rir_start: Option<u32>,
    rir_end: Option<u32>,
    at: Progress,
) -> Vec<PlannedSet> {
    let target = rir_start.map(|start| {
        descend(
            start,
            rir_end.unwrap_or(start),
            at.step,
            at.working_cycles.saturating_sub(1),
        )
    });
    let offsets: &[i32] = match &exercise.rule.rir_mode {
        RirMode::PerExercise => &[],
        RirMode::PerSet { offsets } => offsets,
    };

    let mut position = 0_usize;
    sets.iter()
        .map(|set| {
            let load = set.target_weight_kg.map(|kg| advance(kg, step, at.step));
            let rir = match target {
                Some(target) if is_counted_type(set.set_type) => {
                    let offset = offsets.get(position).copied().unwrap_or(0);
                    position += 1;
                    Some(target + i64::from(offset))
                }
                _ => set.target_rir.map(i64::from),
            };
            prescribed(exercise, set, load, set.target_reps, rir)
        })
        .collect()
}

/// The target RIR at working cycle `step` of `last`, moving from `start` to `end` in whole reps. Integer
/// arithmetic (INV-10), and **a tie rounds to the higher RIR** — the side ADR-010's tie rule takes for
/// loads: when the arithmetic cannot decide, the engine asks for less.
fn descend(start: u32, end: u32, step: u32, last: u32) -> i64 {
    let start = i64::from(start);
    if last == 0 {
        return start;
    }
    let numerator = (i64::from(end) - start) * i64::from(step.min(last));
    let denominator = i64::from(last);
    let whole = numerator.div_euclid(denominator);
    let twice_remainder = 2 * numerator.rem_euclid(denominator);
    // `>=`: on an exact half the higher of the two — `whole + 1` — wins. `div_euclid` floors, so this is
    // "round half up" whichever way the target is moving, and up is always the higher RIR.
    let moved = if twice_remainder >= denominator {
        whole + 1
    } else {
        whole
    };
    start + moved
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rir_descends_in_whole_reps_and_a_tie_takes_the_higher() {
        // 3 → 0 over five steps: 3, 2.4, 1.8, 1.2, 0.6, 0 → 3, 2, 2, 1, 1, 0.
        let ladder: Vec<i64> = (0..=5).map(|step| descend(3, 0, step, 5)).collect();
        assert_eq!(ladder, vec![3, 2, 2, 1, 1, 0]);
        // 3 → 0 over two steps: 1.5 is a tie, and takes 2.
        assert_eq!(descend(3, 0, 1, 2), 2);
        // Rising works the same way: 0 → 3 over two steps, 1.5 → 2.
        assert_eq!(descend(0, 3, 1, 2), 2);
        // One working cycle, or a step past the last, stays inside the range.
        assert_eq!(descend(3, 0, 0, 0), 3);
        assert_eq!(descend(3, 0, 9, 5), 0);
    }

    #[test]
    fn a_ladder_sum_below_zero_is_clamped_up_and_marked() {
        assert_eq!(clamp(Some(-2), 0, 4), (Some(0), true));
        assert_eq!(clamp(Some(3), 0, 4), (Some(3), false));
        assert_eq!(clamp(None, 0, 4), (None, false));
    }
}
