//! Reconciliation's properties, over randomised plans with randomised histories — task 005, stage 3a.
//!
//! The riskiest code in the task: a bug here silently destroys a user's deliberate changes (task 005 §
//! Notes and risks). So each property runs over a random block (every strategy, every deload policy,
//! both unit systems), given a random history — some cycles completed or in progress with random logs,
//! some locked, random user edits and pins in the rest, random older engine stamps, a random today.
//!
//! - **Reconciling a freshly generated plan changes nothing**, so the first reconciliation never rewrites
//!   a block for no reason — `generate` and `reconcile` share one machinery and cannot drift.
//! - **Idempotence** (INV-10): once more on its own output with the same logs changes nothing.
//! - **Only projected cycles with nothing logged differ** (INV-06).
//! - **A user's rows are never touched** (FR-3.14).
//! - **A newer engine's stamp anywhere means the plan comes back exactly as given** (INV-06).
//! - **What the engine writes is liftable and inside its rule** (INV-02, INV-05), whatever the history.

mod common;

use common::{Block, block, stored};
use cyberathlete_core::{
    CycleStatus, ENGINE_VERSION, LoggedSet, PlanCycle, PlanExercise, PlanLog, PlanSession, PlanSet,
    SessionSpec, SetOrigin, WriteKind, generate, reconcile,
};
use proptest::prelude::*;

/// A tape of random bytes, read in order: every choice a history makes comes off it, so proptest shrinks
/// a failing history by shortening the tape.
struct Tape<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl Tape<'_> {
    /// A number in `0..n`, or 0 once the tape runs out.
    fn next(&mut self, n: u32) -> u32 {
        let byte = self.bytes.get(self.at).copied().unwrap_or(0);
        self.at += 1;
        if n == 0 { 0 } else { u32::from(byte) % n }
    }

    /// True about one time in `n`.
    fn one_in(&mut self, n: u32) -> bool {
        self.next(n) == 1 % n.max(1)
    }
}

/// Exercise `n` of each session is `exN`, so the same exercise appears in several sessions and a slot's
/// occurrence is exercised, not assumed.
fn exercise_id(order_index: u32) -> String {
    format!("ex{order_index}")
}

/// The block as `reconcile` reads it straight after generation: cycle 1 as authored, cycles 2..N as
/// generated, every one projected.
fn generated_plan(block: &Block) -> Vec<PlanCycle> {
    let generated = generate(&block.mesocycle, &block.cycle_one);
    let mut sessions: Vec<&SessionSpec> = block.cycle_one.iter().collect();
    sessions.sort_by_key(|it| (it.day_index, it.order_index));
    let spec_of = |at: usize, order_index: u32| {
        sessions[at]
            .exercises
            .iter()
            .find(|it| it.order_index == order_index)
            .expect("every generated exercise comes from cycle 1")
    };

    let length_one = generated
        .first()
        .map_or(block.mesocycle.default_length_days, |it| {
            u32::try_from(it.starts_on - block.mesocycle.start_day)
                .expect("cycle 2 starts after cycle 1")
        });
    let mut plan = vec![PlanCycle {
        cycle_number: 1,
        length_days: length_one,
        starts_on: block.mesocycle.start_day,
        is_deload: false,
        status: CycleStatus::Projected,
        engine_version: ENGINE_VERSION,
        last_write_kind: WriteKind::User,
        sessions: sessions
            .iter()
            .map(|session| {
                let mut exercises: Vec<PlanExercise> = session
                    .exercises
                    .iter()
                    .map(|exercise| {
                        let mut sets: Vec<PlanSet> = exercise
                            .sets
                            .iter()
                            .map(|set| PlanSet {
                                set_index: set.set_index,
                                set_type: set.set_type,
                                target_weight_kg: set.target_weight_kg,
                                target_reps: set.target_reps,
                                target_min_reps: None,
                                target_max_reps: None,
                                target_rir: set.target_rir,
                                was_clamped: false,
                                origin: SetOrigin::UserEdited,
                                is_pinned: false,
                            })
                            .collect();
                        sets.sort_by_key(|it| it.set_index);
                        PlanExercise {
                            order_index: exercise.order_index,
                            exercise_id: exercise_id(exercise.order_index),
                            increment_kg: exercise.increment_kg,
                            rule: exercise.rule.clone(),
                            uses_bodyweight: exercise.uses_bodyweight,
                            body_weight_kg: exercise.body_weight_kg,
                            sets,
                        }
                    })
                    .collect();
                exercises.sort_by_key(|it| it.order_index);
                PlanSession {
                    day_index: session.day_index,
                    order_index: session.order_index,
                    exercises,
                }
            })
            .collect(),
    }];
    plan.extend(generated.into_iter().map(|cycle| {
        PlanCycle {
            cycle_number: cycle.cycle_number,
            length_days: cycle.length_days,
            starts_on: cycle.starts_on,
            is_deload: cycle.is_deload,
            status: CycleStatus::Projected,
            engine_version: cycle.engine_version,
            last_write_kind: WriteKind::Engine,
            sessions: cycle
                .sessions
                .into_iter()
                .enumerate()
                .map(|(at, session)| PlanSession {
                    day_index: session.day_index,
                    order_index: session.order_index,
                    exercises: session
                        .exercises
                        .into_iter()
                        .map(|exercise| {
                            let spec = spec_of(at, exercise.order_index);
                            PlanExercise {
                                order_index: exercise.order_index,
                                exercise_id: exercise_id(exercise.order_index),
                                increment_kg: spec.increment_kg,
                                rule: spec.rule.clone(),
                                uses_bodyweight: spec.uses_bodyweight,
                                body_weight_kg: spec.body_weight_kg,
                                sets: exercise
                                    .sets
                                    .into_iter()
                                    .map(|set| PlanSet {
                                        set_index: set.set_index,
                                        set_type: set.set_type,
                                        target_weight_kg: set.target_weight_kg,
                                        target_reps: set.target_reps,
                                        target_min_reps: set.target_min_reps,
                                        target_max_reps: set.target_max_reps,
                                        target_rir: set.target_rir,
                                        was_clamped: set.was_clamped,
                                        origin: SetOrigin::Generated,
                                        is_pinned: false,
                                    })
                                    .collect(),
                            }
                        })
                        .collect(),
                })
                .collect(),
        }
    }));
    plan
}

/// A random history laid over a generated plan: the first cycles started and logged, later ones
/// sometimes locked, edited or pinned, stamps sometimes older, and now and then a logged set in a cycle
/// whose status still says `projected`.
fn with_history(
    mut plan: Vec<PlanCycle>,
    tape: &mut Tape<'_>,
) -> (Vec<PlanCycle>, Vec<PlanLog>, i32) {
    let cycles = u32::try_from(plan.len()).unwrap_or(u32::MAX);
    let started = tape.next(cycles + 1);
    let mut logs = Vec::new();
    for cycle in &mut plan {
        let number = cycle.cycle_number;
        cycle.engine_version = tape.next(ENGINE_VERSION + 1);
        let is_started = number <= started;
        if is_started {
            cycle.status = if number == started && tape.one_in(3) {
                CycleStatus::InProgress
            } else {
                CycleStatus::Completed
            };
        } else if number > 1 && tape.one_in(6) {
            cycle.status = CycleStatus::Locked;
        } else if number > 1 && tape.one_in(12) {
            cycle.status = CycleStatus::Skipped;
        }
        let stray_log = !is_started && tape.one_in(12);
        let mut edited = false;
        for session in &mut cycle.sessions {
            for exercise in &mut session.exercises {
                let increment = exercise.increment_kg;
                for set in &mut exercise.sets {
                    let log_it =
                        (is_started && !tape.one_in(4)) || (stray_log && set.set_index == 0);
                    if log_it {
                        let shift = f64::from(tape.next(5)) - 2.0;
                        logs.push(PlanLog {
                            cycle_number: number,
                            day_index: session.day_index,
                            session_order_index: session.order_index,
                            exercise_order_index: exercise.order_index,
                            set_index: set.set_index,
                            set: LoggedSet {
                                set_type: set.set_type,
                                is_completed: !tape.one_in(8),
                                weight_kg: set
                                    .target_weight_kg
                                    .map(|kg| stored((kg + shift * increment).max(0.0), 4)),
                                reps: set
                                    .target_reps
                                    .map(|reps| (reps + tape.next(5)).saturating_sub(2)),
                                rir: if tape.one_in(4) {
                                    None
                                } else {
                                    Some(tape.next(7))
                                },
                                uses_bodyweight: exercise.uses_bodyweight,
                                body_weight_kg: exercise.body_weight_kg,
                                is_deload: cycle.is_deload,
                            },
                        });
                    }
                    if !is_started && number > 1 {
                        if tape.one_in(8) {
                            set.origin = SetOrigin::UserEdited;
                            set.target_weight_kg = Some(stored(f64::from(tape.next(200)) * 1.1, 4));
                            set.target_reps = Some(tape.next(30));
                            edited = true;
                        }
                        if tape.one_in(10) {
                            set.is_pinned = true;
                            edited = true;
                        }
                    }
                }
            }
        }
        if edited {
            cycle.last_write_kind = WriteKind::User;
        }
    }
    let first = plan.first().map_or(0, |it| it.starts_on);
    let today = first + i32::try_from(tape.next(cycles * 28 + 1)).unwrap_or(0);
    (plan, logs, today)
}

/// Whether `reconcile` may rewrite this input cycle: projected, not the first, nothing logged in it.
fn rewritable(cycle: &PlanCycle, logs: &[PlanLog]) -> bool {
    cycle.cycle_number != 1
        && cycle.status == CycleStatus::Projected
        && !logs
            .iter()
            .any(|log| log.cycle_number == cycle.cycle_number)
}

fn history() -> impl Strategy<Value = (Block, Vec<u8>)> {
    (block(2..=20), prop::collection::vec(any::<u8>(), 0..600))
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(512))]

    /// Reconciling a freshly generated plan, with nothing logged and nothing edited, changes nothing.
    #[test]
    fn reconciling_a_generated_plan_changes_nothing(block in block(2..=52)) {
        let plan = generated_plan(&block);
        let reconciled = reconcile(&block.mesocycle, &plan, &[], i32::MIN);
        prop_assert!(reconciled.outcomes.is_empty());
        prop_assert_eq!(reconciled.cycles, plan);
    }

    /// INV-10: running reconciliation again on its own output, with the same logs, changes nothing.
    #[test]
    fn reconciling_twice_is_reconciling_once((block, bytes) in history()) {
        let (plan, logs, today) = with_history(generated_plan(&block), &mut Tape { bytes: &bytes, at: 0 });
        let once = reconcile(&block.mesocycle, &plan, &logs, today);
        let twice = reconcile(&block.mesocycle, &once.cycles, &logs, today);
        prop_assert_eq!(twice.cycles, once.cycles);
        prop_assert_eq!(twice.outcomes, once.outcomes);
    }

    /// INV-06 and FR-3.14: only projected cycles with nothing logged may differ, and inside them a
    /// user-edited or pinned row is kept exactly.
    #[test]
    fn only_projected_cycles_change_and_a_users_rows_never_do((block, bytes) in history()) {
        let (plan, logs, today) = with_history(generated_plan(&block), &mut Tape { bytes: &bytes, at: 0 });
        let reconciled = reconcile(&block.mesocycle, &plan, &logs, today);
        prop_assert_eq!(reconciled.cycles.len(), plan.len());
        for (before, after) in plan.iter().zip(&reconciled.cycles) {
            if !rewritable(before, &logs) {
                prop_assert_eq!(after, before, "cycle {} is not the engine's to rewrite", before.cycle_number);
                continue;
            }
            prop_assert_eq!(after.engine_version, ENGINE_VERSION);
            prop_assert_eq!(after.last_write_kind, WriteKind::Engine);
            for (session_before, session_after) in before.sessions.iter().zip(&after.sessions) {
                for (exercise_before, exercise_after) in session_before.exercises.iter().zip(&session_after.exercises) {
                    for users in exercise_before.sets.iter().filter(|it| it.is_users()) {
                        prop_assert!(
                            exercise_after.sets.contains(users),
                            "cycle {}: the user's set {} was touched", before.cycle_number, users.set_index
                        );
                    }
                }
            }
        }
    }

    /// INV-02 and INV-05: every row the engine writes — whatever it anchored on, a logged load off the
    /// plan or a user's edit outside the rule — is on its exercise's grid and inside its rule.
    #[test]
    fn what_the_engine_writes_is_liftable_and_inside_the_rule((block, bytes) in history()) {
        let (plan, logs, today) = with_history(generated_plan(&block), &mut Tape { bytes: &bytes, at: 0 });
        let reconciled = reconcile(&block.mesocycle, &plan, &logs, today);
        for (before, after) in plan.iter().zip(&reconciled.cycles) {
            if !rewritable(before, &logs) {
                continue;
            }
            for exercise in after.sessions.iter().flat_map(|it| &it.exercises) {
                let rule = &exercise.rule;
                for set in exercise.sets.iter().filter(|it| it.origin == SetOrigin::Generated) {
                    if let Some(load) = set.target_weight_kg {
                        let steps = (load / exercise.increment_kg).round();
                        prop_assert_eq!(load, steps * exercise.increment_kg, "cycle {}: off the grid", after.cycle_number);
                    }
                    if let Some(reps) = set.target_reps {
                        prop_assert!((rule.min_reps..=rule.max_reps).contains(&reps), "cycle {}: {} reps", after.cycle_number, reps);
                    }
                    if let Some(rir) = set.target_rir {
                        prop_assert!((rule.min_rir..=rule.max_rir).contains(&rir), "cycle {}: RIR {}", after.cycle_number, rir);
                    }
                }
            }
        }
    }

    /// INV-06: a plan holding one cycle stamped by a newer engine comes back exactly as given, with no
    /// outcome reported — the older engine yields.
    #[test]
    fn an_older_engine_yields_to_a_newer_stamp((block, bytes) in history(), pick in any::<prop::sample::Index>()) {
        let (mut plan, logs, today) = with_history(generated_plan(&block), &mut Tape { bytes: &bytes, at: 0 });
        let at = pick.index(plan.len());
        plan[at].engine_version = ENGINE_VERSION + 1;
        let reconciled = reconcile(&block.mesocycle, &plan, &logs, today);
        prop_assert_eq!(reconciled.cycles, plan);
        prop_assert!(reconciled.outcomes.is_empty());
    }
}
