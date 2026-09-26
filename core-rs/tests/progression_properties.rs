//! The planner's properties, over randomised blocks — task 005, stage 1.
//!
//! Examples prove the cases someone thought of; these prove the invariants hold for the ones nobody did.
//! `proptest` is a dev-dependency only and never reaches the library ([ADR-012](../../docs/decisions/ADR-012.md)
//! § Amendment 2026-09-26), and when a property fails it **shrinks** the block to the smallest one that
//! still breaks it.
//!
//! Over all five v1 strategies and both RIR modes: liftable loads in both unit systems (INV-02) — once
//! over 52-cycle blocks after storage, and once over **10 000 random rules**, task 005's criterion; rep
//! and RIR bounds, every per-set sum included (INV-05); day indices inside their own cycle (INV-25);
//! contiguous dates; one natural key per row (ADR-002); the same output from the same input (INV-10);
//! and `none` never deloading (FR-3.1b).

use cyberathlete_core::{
    CycleOneSet, DeloadPolicy, ENGINE_VERSION, ExerciseSpec, LengthOverride, LoadStep,
    MesocycleSpec, PlannedMicrocycle, RirMode, RoundingMode, Rule, SessionSpec, SetType,
    Strategy as Progression, generate, round_to_increment,
};
use proptest::prelude::*;
use std::collections::BTreeSet;

/// Kilograms per pound, exactly (ADR-008).
const KG_PER_LB: f64 = 0.453_592_37;

/// A load or an increment as `numeric(p, scale)` stores it — the round trip every prescription takes
/// through Postgres before a device reads it back (INV-02).
fn stored(value: f64, scale: i32) -> f64 {
    let factor = 10_f64.powi(scale);
    (value * factor).round() / factor
}

/// The seeded increments, both unit systems: metric in kilograms, imperial as the exact kilogram
/// equivalent of a pound step, stored at `numeric(10,6)` as `modality_increments` holds them.
fn increment() -> impl Strategy<Value = (f64, Option<f64>)> {
    prop_oneof![
        prop::sample::select(vec![0.5, 1.0, 1.25, 2.0, 2.5, 5.0]).prop_map(|kg| (kg, None)),
        prop::sample::select(vec![1.0, 2.5, 5.0, 10.0])
            .prop_map(|lb| (stored(lb * KG_PER_LB, 6), Some(lb))),
    ]
}

fn rounding() -> impl Strategy<Value = RoundingMode> {
    prop::sample::select(vec![
        RoundingMode::Nearest,
        RoundingMode::Down,
        RoundingMode::Up,
    ])
}

fn set_type() -> impl Strategy<Value = SetType> {
    prop::sample::select(vec![
        SetType::Working,
        SetType::Working,
        SetType::Amrap,
        SetType::Warmup,
        SetType::Backoff,
        SetType::Drop,
    ])
}

/// A load step: whole increments in kilograms, or basis points of cycle 1's load.
fn load_step(step_kg: f64) -> impl Strategy<Value = LoadStep> {
    prop_oneof![
        (1_u32..=4).prop_map(move |n| LoadStep::Kg(f64::from(n) * step_kg)),
        (1_u32..=1_000).prop_map(LoadStep::BasisPoints),
    ]
}

/// Any of the five v1 strategies, with the parameters each carries — an empty wave, a missing RIR
/// start or end and a zero rep step included, since the engine must be total over all of them.
fn strategy(step_kg: f64) -> impl Strategy<Value = Progression> {
    prop_oneof![
        Just(Progression::Fixed),
        load_step(step_kg).prop_map(Progression::LinearLoad),
        (load_step(step_kg), 0_u32..=4)
            .prop_map(|(step, rep_step)| Progression::DoubleProgression { step, rep_step }),
        (
            prop::collection::vec(4_000_u32..=10_000, 0..=4),
            20.0_f64..400.0
        )
            .prop_map(|(wave_bp, baseline)| Progression::Percent1rm {
                wave_bp,
                baseline_e1rm_kg: stored(baseline, 4),
            }),
        (
            load_step(step_kg),
            prop::option::weighted(0.9, 0_u32..=10),
            prop::option::weighted(0.9, 0_u32..=10)
        )
            .prop_map(|(step, rir_start, rir_end)| Progression::RirAutoregulated {
                step,
                rir_start,
                rir_end,
            }),
    ]
}

fn rir_mode() -> impl Strategy<Value = RirMode> {
    prop_oneof![
        Just(RirMode::PerExercise),
        prop::collection::vec(-4_i32..=4, 0..=6).prop_map(|offsets| RirMode::PerSet { offsets }),
    ]
}

/// One exercise of cycle 1: a rule of any strategy, and up to six sets whose targets may sit outside
/// the rule's bounds, so the clamp is exercised rather than assumed. A bodyweight exercise, with or
/// without a body weight, for `percent_1rm`'s added load.
fn exercise(
    order_index: u32,
    increment_kg: f64,
    step_kg: f64,
) -> impl Strategy<Value = ExerciseSpec> {
    let rule = (
        strategy(step_kg),
        1_u32..=12,
        0_u32..=8,
        0_u32..=5,
        0_u32..=5,
        rounding(),
        rir_mode(),
    )
        .prop_map(
            |(strategy, min_reps, rep_span, min_rir, rir_span, rounding, rir_mode)| Rule {
                strategy,
                min_reps,
                max_reps: min_reps + rep_span,
                min_rir,
                max_rir: (min_rir + rir_span).min(10),
                rounding,
                rir_mode,
            },
        );
    let set = (
        set_type(),
        prop::option::weighted(0.9, 0.0_f64..300.0),
        prop::option::weighted(0.9, 0_u32..=25),
        prop::option::weighted(0.7, 0_u32..=10),
    );
    let body = (
        prop::bool::weighted(0.2),
        prop::option::weighted(0.7, 40.0_f64..150.0),
    );
    (rule, body, prop::collection::vec(set, 1..=6)).prop_map(
        move |(rule, (uses_bodyweight, body), sets)| ExerciseSpec {
            order_index,
            increment_kg,
            rule,
            uses_bodyweight,
            body_weight_kg: body.map(|it| stored(it, 4)),
            sets: (0..)
                .zip(sets)
                .map(|(set_index, (set_type, weight, reps, rir))| CycleOneSet {
                    set_index,
                    set_type,
                    // A load as it would have been stored, so the start is itself a storable value.
                    target_weight_kg: weight.map(|it| stored(it, 4)),
                    target_reps: reps,
                    target_rir: rir,
                })
                .collect(),
        },
    )
}

/// Cycle 1: up to four sessions on distinct days of a cycle up to 28 days, each with one or two
/// exercises, every exercise on the same increment so the INV-02 check knows which grid to test against.
fn cycle_one(increment_kg: f64, step_kg: f64) -> impl Strategy<Value = Vec<SessionSpec>> {
    prop::collection::btree_set(1_u32..=28, 1..=4).prop_flat_map(move |days| {
        let sessions: Vec<_> = days
            .into_iter()
            .map(|day_index| {
                prop::collection::vec(Just(()), 1..=2).prop_flat_map(move |slots| {
                    let exercises: Vec<_> = (0..)
                        .zip(slots)
                        .map(|(order_index, ())| exercise(order_index, increment_kg, step_kg))
                        .collect();
                    exercises.prop_map(move |exercises| SessionSpec {
                        day_index,
                        order_index: 0,
                        exercises,
                    })
                })
            })
            .collect();
        sessions
    })
}

fn deload_policy(num_microcycles: u32) -> impl Strategy<Value = DeloadPolicy> {
    prop_oneof![
        Just(DeloadPolicy::None),
        (1_u32..=8, any::<bool>())
            .prop_map(|(every, final_cycle)| DeloadPolicy::EveryN { every, final_cycle }),
        prop::collection::vec(1..=num_microcycles, 0..=6)
            .prop_map(|cycles| DeloadPolicy::Manual { cycles }),
    ]
}

/// A mesocycle of `num_microcycles`, any default length, a few cycles of another length, any policy,
/// and any deload multipliers.
fn mesocycle(num_microcycles: u32) -> impl Strategy<Value = MesocycleSpec> {
    (
        -20_000_i32..=40_000,
        1_u32..=28,
        prop::collection::vec((1..=num_microcycles, 1_u32..=28), 0..=4),
        deload_policy(num_microcycles),
        1_u32..=10_000,
        1_u32..=10_000,
        0_u32..=5,
    )
        .prop_map(
            move |(start_day, default_length_days, overrides, deload, set_bp, load_bp, bump)| {
                MesocycleSpec {
                    start_day,
                    num_microcycles,
                    default_length_days,
                    length_overrides: overrides
                        .into_iter()
                        .map(|(cycle_number, length_days)| LengthOverride {
                            cycle_number,
                            length_days,
                        })
                        .collect(),
                    deload,
                    deload_set_bp: set_bp,
                    deload_load_bp: load_bp,
                    deload_rir_bump: bump,
                }
            },
        )
}

/// A whole block: mesocycle, cycle 1, and the grid it must stay on (kilograms, and pounds if imperial).
fn block(cycles: std::ops::RangeInclusive<u32>) -> impl Strategy<Value = Block> {
    (cycles, increment()).prop_flat_map(|(num_microcycles, (increment_kg, lb))| {
        (
            mesocycle(num_microcycles),
            cycle_one(increment_kg, increment_kg),
        )
            .prop_map(move |(mesocycle, cycle_one)| Block {
                mesocycle,
                cycle_one,
                increment_kg,
                lb,
            })
    })
}

#[derive(Debug, Clone)]
struct Block {
    mesocycle: MesocycleSpec,
    cycle_one: Vec<SessionSpec>,
    increment_kg: f64,
    /// The pound step, when the increment is an imperial one.
    lb: Option<f64>,
}

fn every_set(block: &[PlannedMicrocycle]) -> impl Iterator<Item = &cyberathlete_core::PlannedSet> {
    block
        .iter()
        .flat_map(|cycle| &cycle.sessions)
        .flat_map(|session| &session.exercises)
        .flat_map(|exercise| &exercise.sets)
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(512))]

    /// INV-02, in both unit systems, over 52 cycles: every generated load is an exact multiple of its
    /// increment, **and stays one after storage** — `numeric(9,4)` and back lands on the same step, and an
    /// imperial load reads as a whole number of pound steps.
    #[test]
    fn every_load_is_liftable_after_storage_in_both_unit_systems(block in block(52..=52)) {
        let generated = generate(&block.mesocycle, &block.cycle_one);
        prop_assert_eq!(generated.len(), 51);
        for set in every_set(&generated) {
            let Some(load) = set.target_weight_kg else { continue };
            let steps = (load / block.increment_kg).round();
            prop_assert_eq!(load, steps * block.increment_kg, "on the grid");

            let back = stored(load, 4);
            prop_assert_eq!(
                round_to_increment(back, block.increment_kg, RoundingMode::Nearest),
                load,
                "storage moved {} kg to another step", load
            );
            // What an imperial user reads: pounds at the two places the app's formatting module shows
            // (`apps/mobile/src/ui/format/quantities.ts`), which must be a whole number of their plate
            // steps. Not a tighter tolerance on the raw quotient: a pound step stored at `numeric(10,6)` is
            // 3.7e-7 kg short, which shrinking found adds up to 0.001 lb by 1 120 lb — invisible, and
            // exactly what INV-02's precision argument allows for.
            if let Some(lb) = block.lb {
                let shown = (back / KG_PER_LB * 100.0).round() / 100.0;
                let steps = shown / lb;
                prop_assert!(
                    (steps - steps.round()).abs() < 1e-9,
                    "{} kg is shown as {} lb, off the {} lb grid", back, shown, lb
                );
            }
        }
    }

    /// INV-05: every generated rep and RIR target sits inside its rule's bounds — deloads, every per-set
    /// ladder sum and every double-progression step included — and a rep range is shown on exactly the
    /// counted sets of a double-progression exercise.
    #[test]
    fn every_target_is_inside_its_rule(block in block(2..=52)) {
        let generated = generate(&block.mesocycle, &block.cycle_one);
        for cycle in &generated {
            for (session, spec) in cycle.sessions.iter().zip(sorted(&block.cycle_one)) {
                for exercise in &session.exercises {
                    let rule: &Rule = spec
                        .exercises
                        .iter()
                        .find(|it| it.order_index == exercise.order_index)
                        .map(|it| &it.rule)
                        .expect("every generated exercise comes from cycle 1");
                    let double = matches!(rule.strategy, Progression::DoubleProgression { .. });
                    for set in &exercise.sets {
                        if let Some(reps) = set.target_reps {
                            prop_assert!((rule.min_reps..=rule.max_reps).contains(&reps));
                        }
                        if let Some(rir) = set.target_rir {
                            prop_assert!((rule.min_rir..=rule.max_rir).contains(&rir));
                        }
                        let ranged = double && cyberathlete_core::is_counted_type(set.set_type);
                        prop_assert_eq!(
                            (set.target_min_reps, set.target_max_reps),
                            if ranged { (Some(rule.min_reps), Some(rule.max_reps)) } else { (None, None) }
                        );
                    }
                }
            }
        }
    }

    /// INV-25 and 03 §5: every session inside its own cycle, and each cycle starting exactly one length
    /// after the one before — for every mix of lengths.
    #[test]
    fn days_fit_their_cycle_and_dates_are_contiguous(block in block(2..=52)) {
        let generated = generate(&block.mesocycle, &block.cycle_one);
        for cycle in &generated {
            prop_assert!((1..=28).contains(&cycle.length_days));
            for session in &cycle.sessions {
                prop_assert!((1..=cycle.length_days).contains(&session.day_index));
            }
        }
        for pair in generated.windows(2) {
            prop_assert_eq!(pair[1].cycle_number, pair[0].cycle_number + 1);
            prop_assert_eq!(
                i64::from(pair[1].starts_on),
                i64::from(pair[0].starts_on) + i64::from(pair[0].length_days)
            );
        }
        if let Some(first) = generated.first() {
            prop_assert_eq!(first.cycle_number, 2);
            let cycle_one_length = block
                .mesocycle
                .length_overrides
                .iter()
                .rev()
                .find(|it| it.cycle_number == 1)
                .map_or(block.mesocycle.default_length_days, |it| it.length_days);
            prop_assert_eq!(
                i64::from(first.starts_on),
                i64::from(block.mesocycle.start_day) + i64::from(cycle_one_length)
            );
        }
    }

    /// ADR-002 § Amendment: the engine names rows by natural key, so within a cycle no two sessions share
    /// `(day_index, order_index)`, and cycle 1's every session appears in every cycle — none is dropped.
    #[test]
    fn natural_keys_are_unique_and_no_session_is_dropped(block in block(2..=52)) {
        let generated = generate(&block.mesocycle, &block.cycle_one);
        for cycle in &generated {
            let keys: BTreeSet<(u32, u32)> = cycle
                .sessions
                .iter()
                .map(|it| (it.day_index, it.order_index))
                .collect();
            prop_assert_eq!(keys.len(), cycle.sessions.len());
            prop_assert_eq!(cycle.sessions.len(), block.cycle_one.len());
            prop_assert_eq!(cycle.engine_version, ENGINE_VERSION);
        }
    }

    /// INV-10: the same input gives the same output — and so does the same input in another order.
    #[test]
    fn the_same_block_generates_the_same_plan(block in block(2..=52)) {
        let once = generate(&block.mesocycle, &block.cycle_one);
        prop_assert_eq!(&once, &generate(&block.mesocycle, &block.cycle_one));
        let reversed: Vec<SessionSpec> = block.cycle_one.iter().rev().cloned().collect();
        prop_assert_eq!(&once, &generate(&block.mesocycle, &reversed));
    }

    /// FR-3.1b: under `none`, no cycle is a deload and every cycle keeps all of cycle 1's sets.
    #[test]
    fn none_never_deloads(block in block(2..=52)) {
        let mesocycle = MesocycleSpec { deload: DeloadPolicy::None, ..block.mesocycle.clone() };
        let generated = generate(&mesocycle, &block.cycle_one);
        prop_assert_eq!(generated.len() + 1, mesocycle.num_microcycles as usize);
        let sets_in_cycle_one: usize = block
            .cycle_one
            .iter()
            .flat_map(|session| &session.exercises)
            .map(|exercise| exercise.sets.len())
            .sum();
        for cycle in &generated {
            prop_assert!(!cycle.is_deload);
            let sets: usize = cycle
                .sessions
                .iter()
                .flat_map(|session| &session.exercises)
                .map(|exercise| exercise.sets.len())
                .sum();
            prop_assert_eq!(sets, sets_in_cycle_one);
        }
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(10_000))]

    /// Task 005's criterion: **no generated weight is ever a non-multiple of the increment, over 10 000
    /// random rules** — every strategy, both RIR modes, both unit systems, bodyweight exercises with and
    /// without a body weight, any deload policy and block length.
    #[test]
    fn no_load_is_ever_off_the_grid_over_ten_thousand_rules(block in block(2..=52)) {
        for set in every_set(&generate(&block.mesocycle, &block.cycle_one)) {
            let Some(load) = set.target_weight_kg else { continue };
            prop_assert!(load.is_finite() && load >= 0.0, "{} kg", load);
            let steps = (load / block.increment_kg).round();
            prop_assert_eq!(load, steps * block.increment_kg, "on the grid");
        }
    }
}

/// Cycle 1's sessions in the canonical order the engine emits them. Distinct days by construction, so a
/// session never moves past another when a shorter cycle compresses them.
fn sorted(sessions: &[SessionSpec]) -> Vec<&SessionSpec> {
    let mut sorted: Vec<&SessionSpec> = sessions.iter().collect();
    sorted.sort_by_key(|it| (it.day_index, it.order_index));
    sorted
}
