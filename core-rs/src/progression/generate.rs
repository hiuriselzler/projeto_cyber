//! FR-3.3 — the user defines microcycle 1; the engine generates microcycles 2..N.
//!
//! Every generated row is materialised ([ADR-002](../../../docs/decisions/ADR-002.md)), so this returns
//! the whole block at once: dated, flagged, stamped with [`ENGINE_VERSION`], and every load already on
//! the plate grid. It is a pure function of its two arguments (INV-10) — it takes no `now`, because
//! nothing it produces depends on the day it runs.

use super::ENGINE_VERSION;
use super::dates::{clamp_length, resolve_dates};
use super::deload::{deload_schedule, deload_sets};
use super::plan::{
    ExerciseSpec, MAX_MICROCYCLES, MesocycleSpec, PlannedExercise, PlannedMicrocycle,
    PlannedSession, SessionSpec,
};
use super::strategies::{Prescriber, Progress, project};

/// Generate microcycles 2..N from microcycle 1.
///
/// **How a block advances** (01 §3.2, FR-3.9). Each working cycle stands one progression step past the
/// working cycle before it; cycle 1 is step 0. What a step means is the strategy's
/// ([`strategies`](super::strategies)). A deload **consumes no step**: it prescribes a share of each
/// set's last working prescription, and the cycle after it resumes one step past the last working cycle.
/// In the owner's example that is 50 kg at cycle 5, 30 kg at cycle 6 and 52.5 kg at cycle 7.
///
/// **Every load is re-anchored**, never nudged: a working load is computed from cycle 1 and its steps,
/// then rounded once by the rule's own mode (INV-02). Error cannot accumulate across a block, because no
/// load is computed from a load that was already rounded — except a deload's, which is one rounding away
/// from a load already on the grid.
///
/// **Total** (INV-10): a block longer than 52 cycles is cut at 52, a length outside 1–28 is clamped, a
/// target outside its rule's bounds is clamped and marked `was_clamped` (INV-05), and nothing panics.
/// The output is canonical — sessions by `(day_index, order_index)`, exercises by `order_index`, sets by
/// `set_index` — whatever order the input came in.
#[must_use]
pub fn generate(spec: &MesocycleSpec, cycle_one: &[SessionSpec]) -> Vec<PlannedMicrocycle> {
    let cycles = spec.num_microcycles.min(MAX_MICROCYCLES);
    let lengths: Vec<u32> = (1..=cycles).map(|cycle| length_of(spec, cycle)).collect();
    let starts = resolve_dates(spec.start_day, &lengths);
    let deloads = deload_schedule(&spec.deload, cycles);
    // Cycle 1 is never a deload, so it is always the first working cycle.
    let working_cycles = deloads.iter().fold(
        0_u32,
        |count, &deload| {
            if deload { count } else { count + 1 }
        },
    );

    let mut sessions: Vec<&SessionSpec> = cycle_one.iter().collect();
    sessions.sort_by_key(|session| (session.day_index, session.order_index));

    let mut block = Vec::with_capacity(lengths.len().saturating_sub(1));
    // The step the current cycle stands on. It only moves on a working cycle, so on a deload it still
    // holds the last working cycle's step — which is the prescription a deload multiplies.
    let mut step = 0_u32;
    for ((cycle, (&length, &starts_on)), &is_deload) in
        (1..).zip(lengths.iter().zip(&starts)).zip(&deloads)
    {
        if cycle == 1 {
            continue;
        }
        if !is_deload {
            step += 1;
        }
        // Cycle 1 is every exercise's only anchor here, so steps and position are both the working
        // cycles since it — the case `reconcile` must reproduce exactly when nothing else has happened.
        let at = Progress {
            steps: step,
            position: step,
            working_cycles,
        };
        let deload = is_deload.then_some(spec);
        let sessions = lay_out(&sessions, length)
            .into_iter()
            .map(|(day_index, order_index, session)| PlannedSession {
                day_index,
                order_index,
                exercises: prescribe_session(session, at, deload),
            })
            .collect();
        block.push(PlannedMicrocycle {
            cycle_number: cycle,
            length_days: length,
            starts_on,
            is_deload,
            engine_version: ENGINE_VERSION,
            sessions,
        });
    }
    block
}

/// A cycle's length: its override if the user changed it, the mesocycle's default otherwise.
fn length_of(spec: &MesocycleSpec, cycle: u32) -> u32 {
    let length = spec
        .length_overrides
        .iter()
        .rev()
        .find(|it| it.cycle_number == cycle)
        .map_or(spec.default_length_days, |it| it.length_days);
    clamp_length(length)
}

/// Place cycle 1's sessions, sorted by `(day_index, order_index)`, into a cycle of `length` days.
///
/// A session that falls past the end of a shorter cycle — day 7 in a 5-day travel cycle — **moves to the
/// cycle's last day, after the sessions already there**, in its original order. Nothing is dropped:
/// a shorter cycle compresses the training, it does not quietly remove some (INV-25). A session on day 0,
/// which the schema's CHECK forbids, is read as day 1.
fn lay_out<'a>(sessions: &[&'a SessionSpec], length: u32) -> Vec<(u32, u32, &'a SessionSpec)> {
    let day = |session: &SessionSpec| session.day_index.max(1);
    let mut next_on_last_day = sessions
        .iter()
        .filter(|session| day(session) == length)
        .map(|session| session.order_index.saturating_add(1))
        .max()
        .unwrap_or(0);

    let mut placed: Vec<(u32, u32, &SessionSpec)> = sessions
        .iter()
        .map(|&session| {
            if day(session) <= length {
                (day(session), session.order_index, session)
            } else {
                let order = next_on_last_day;
                next_on_last_day = next_on_last_day.saturating_add(1);
                (length, order, session)
            }
        })
        .collect();
    placed.sort_by_key(|&(day_index, order_index, _)| (day_index, order_index));
    placed
}

fn prescribe_session(
    session: &SessionSpec,
    at: Progress,
    deload: Option<&MesocycleSpec>,
) -> Vec<PlannedExercise> {
    let mut exercises: Vec<&ExerciseSpec> = session.exercises.iter().collect();
    exercises.sort_by_key(|exercise| exercise.order_index);
    exercises
        .into_iter()
        .map(|exercise| {
            let prescriber = Prescriber::of_spec(exercise);
            let working = project(prescriber, &exercise.sets, None, at);
            PlannedExercise {
                order_index: exercise.order_index,
                sets: match deload {
                    None => working,
                    Some(spec) => deload_sets(prescriber, working, spec),
                },
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progression::RoundingMode;
    use crate::progression::deload::deload_set_count;
    use crate::progression::plan::{
        CycleOneSet, DeloadPolicy, FailurePolicy, LengthOverride, LoadStep, PlannedSet, RirMode,
        Rule, Strategy,
    };
    use crate::strength::SetType;

    fn rule(strategy: Strategy) -> Rule {
        Rule {
            strategy,
            min_reps: 6,
            max_reps: 6,
            min_rir: 0,
            max_rir: 4,
            rounding: RoundingMode::Nearest,
            rir_mode: RirMode::PerExercise,
            failure_policy: FailurePolicy::Hold,
        }
    }

    fn working(set_index: u32, weight_kg: f64) -> CycleOneSet {
        CycleOneSet {
            set_index,
            set_type: SetType::Working,
            target_weight_kg: Some(weight_kg),
            target_reps: Some(6),
            target_rir: Some(3),
        }
    }

    fn spec(num_microcycles: u32, deload: DeloadPolicy) -> MesocycleSpec {
        MesocycleSpec {
            start_day: 0,
            num_microcycles,
            default_length_days: 7,
            length_overrides: Vec::new(),
            deload,
            deload_set_bp: 5000,
            deload_load_bp: 6000,
            deload_rir_bump: 2,
        }
    }

    fn exercise(rule: Rule, sets: Vec<CycleOneSet>) -> ExerciseSpec {
        ExerciseSpec {
            order_index: 0,
            increment_kg: 2.5,
            rule,
            uses_bodyweight: false,
            body_weight_kg: None,
            sets,
        }
    }

    fn one_session(strategy: Strategy, sets: Vec<CycleOneSet>) -> Vec<SessionSpec> {
        vec![SessionSpec {
            day_index: 1,
            order_index: 0,
            exercises: vec![exercise(rule(strategy), sets)],
        }]
    }

    fn first_set(cycle: &PlannedMicrocycle) -> PlannedSet {
        cycle.sessions[0].exercises[0].sets[0]
    }

    #[test]
    fn the_owner_s_example_reaches_62_5_kg_at_cycle_11() {
        let block = generate(
            &spec(
                12,
                DeloadPolicy::EveryN {
                    every: 6,
                    final_cycle: false,
                },
            ),
            &one_session(
                Strategy::LinearLoad(LoadStep::Kg(2.5)),
                vec![working(0, 40.0), working(1, 40.0), working(2, 40.0)],
            ),
        );
        let loads: Vec<f64> = block
            .iter()
            .map(|cycle| first_set(cycle).target_weight_kg.unwrap())
            .collect();
        assert_eq!(
            loads,
            vec![
                42.5, 45.0, 47.5, 50.0, 30.0, 52.5, 55.0, 57.5, 60.0, 62.5, 37.5
            ]
        );
        let deload = &block[4];
        assert!(deload.is_deload);
        assert_eq!(deload.sessions[0].exercises[0].sets.len(), 1);
        assert_eq!(first_set(deload).target_rir, Some(4));
        assert!(first_set(deload).was_clamped);
        assert!(!first_set(&block[5]).was_clamped);
    }

    #[test]
    fn a_2_5_percent_step_from_140_kg_prescribes_142_5_kg() {
        // Task 005's criterion: 250 bp, where the former two-decimal fraction stored 3 % and gave 145.
        let block = generate(
            &spec(3, DeloadPolicy::None),
            &one_session(
                Strategy::LinearLoad(LoadStep::BasisPoints(250)),
                vec![working(0, 140.0)],
            ),
        );
        assert_eq!(first_set(&block[0]).target_weight_kg, Some(142.5));
        // 147 kg — 140 plus two shares of 3.5, not 140 × 1.025², which would compound.
        assert_eq!(first_set(&block[1]).target_weight_kg, Some(147.5));
    }

    #[test]
    fn a_deload_keeps_half_the_working_sets_a_tie_to_the_fewer_and_never_none() {
        for (counted, kept) in [(0, 0), (1, 1), (2, 1), (3, 1), (4, 2), (5, 2), (6, 3)] {
            assert_eq!(deload_set_count(counted, 5000), kept, "{counted} sets");
        }
        assert_eq!(deload_set_count(3, 7000), 2, "2.1 sets");
        assert_eq!(deload_set_count(3, 20_000), 3, "never more than there were");
    }

    #[test]
    fn a_warmup_survives_the_deload_s_cut_and_is_deloaded_like_the_rest() {
        let warmup = CycleOneSet {
            set_index: 0,
            set_type: SetType::Warmup,
            target_weight_kg: Some(20.0),
            target_reps: Some(6),
            target_rir: None,
        };
        let block = generate(
            &spec(2, DeloadPolicy::Manual { cycles: vec![2] }),
            &one_session(
                Strategy::Fixed,
                vec![warmup, working(1, 60.0), working(2, 60.0)],
            ),
        );
        let sets = &block[0].sessions[0].exercises[0].sets;
        let summary: Vec<(u32, Option<f64>, Option<u32>)> = sets
            .iter()
            .map(|set| (set.set_index, set.target_weight_kg, set.target_rir))
            .collect();
        // 20 × 0.6 = 12 → 12.5 on the grid; 60 × 0.6 = 36 → 35; one of two working sets kept.
        assert_eq!(
            summary,
            vec![(0, Some(12.5), None), (1, Some(35.0), Some(4))]
        );
    }

    #[test]
    fn a_session_past_a_short_cycle_s_end_moves_to_its_last_day() {
        let session = |day_index, order_index| SessionSpec {
            day_index,
            order_index,
            exercises: Vec::new(),
        };
        let cycle_one = vec![session(7, 0), session(1, 0), session(5, 0), session(3, 0)];
        let mut mesocycle = spec(3, DeloadPolicy::None);
        mesocycle.length_overrides = vec![LengthOverride {
            cycle_number: 3,
            length_days: 5,
        }];
        let block = generate(&mesocycle, &cycle_one);

        let keys = |cycle: &PlannedMicrocycle| -> Vec<(u32, u32)> {
            cycle
                .sessions
                .iter()
                .map(|it| (it.day_index, it.order_index))
                .collect()
        };
        assert_eq!(keys(&block[0]), vec![(1, 0), (3, 0), (5, 0), (7, 0)]);
        assert_eq!(keys(&block[1]), vec![(1, 0), (3, 0), (5, 0), (5, 1)]);
        assert_eq!(block[1].length_days, 5);
        assert_eq!(block[1].starts_on, 14);
    }

    #[test]
    fn a_target_outside_its_rule_is_clamped_and_marked() {
        let set = CycleOneSet {
            target_reps: Some(10),
            target_rir: Some(6),
            ..working(0, 40.0)
        };
        let block = generate(
            &spec(2, DeloadPolicy::None),
            &one_session(Strategy::Fixed, vec![set]),
        );
        let planned = first_set(&block[0]);
        assert_eq!(
            (planned.target_reps, planned.target_rir),
            (Some(6), Some(4))
        );
        assert!(planned.was_clamped);
    }

    #[test]
    fn fixed_holds_the_load_but_puts_it_on_the_grid() {
        // INV-02 holds for `fixed` too: a load typed off the grid in cycle 1 is liftable from cycle 2.
        let block = generate(
            &spec(3, DeloadPolicy::None),
            &one_session(Strategy::Fixed, vec![working(0, 41.0)]),
        );
        for cycle in &block {
            assert_eq!(first_set(cycle).target_weight_kg, Some(40.0));
        }
    }

    #[test]
    fn a_block_past_52_cycles_is_cut_at_52_and_every_cycle_is_stamped() {
        let block = generate(
            &spec(60, DeloadPolicy::None),
            &one_session(Strategy::Fixed, vec![working(0, 40.0)]),
        );
        assert_eq!(block.len(), 51);
        assert_eq!(block.last().map(|it| it.cycle_number), Some(52));
        assert!(block.iter().all(|it| it.engine_version == ENGINE_VERSION));
    }

    #[test]
    fn double_progression_is_the_task_s_own_sequence() {
        // Task 005's criterion: range 6–8, 2.5 kg step → 3×6@40 → 3×7@40 → 3×8@40 → 3×6@42.5.
        let mut double = rule(Strategy::DoubleProgression {
            step: LoadStep::Kg(2.5),
            rep_step: 1,
        });
        double.max_reps = 8;
        let sessions = vec![SessionSpec {
            day_index: 1,
            order_index: 0,
            exercises: vec![exercise(
                double,
                vec![working(0, 40.0), working(1, 40.0), working(2, 40.0)],
            )],
        }];
        let block = generate(&spec(4, DeloadPolicy::None), &sessions);
        let shape: Vec<Vec<(Option<u32>, Option<f64>)>> = block
            .iter()
            .map(|cycle| {
                cycle.sessions[0].exercises[0]
                    .sets
                    .iter()
                    .map(|set| (set.target_reps, set.target_weight_kg))
                    .collect()
            })
            .collect();
        assert_eq!(
            shape,
            vec![
                vec![(Some(7), Some(40.0)); 3],
                vec![(Some(8), Some(40.0)); 3],
                vec![(Some(6), Some(42.5)); 3],
            ]
        );
        let set = first_set(&block[0]);
        assert_eq!(
            (set.target_min_reps, set.target_max_reps),
            (Some(6), Some(8))
        );
    }
}
