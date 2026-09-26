//! Random plans for the planner's properties — shared by `progression_properties` and
//! `reconcile_properties` (task 005). Test code only: `proptest` never reaches the library (ADR-012 §
//! Amendment 2026-09-26).

#![allow(
    dead_code,
    reason = "each test crate compiles this module and uses part of it"
)]

use cyberathlete_core::{
    CycleOneSet, DeloadPolicy, ExerciseSpec, FailurePolicy, LengthOverride, LoadStep,
    MesocycleSpec, RirMode, RoundingMode, Rule, SessionSpec, SetType, Strategy as Progression,
};
use proptest::prelude::*;

/// Kilograms per pound, exactly (ADR-008).
pub const KG_PER_LB: f64 = 0.453_592_37;

/// A load or an increment as `numeric(p, scale)` stores it — the round trip every prescription takes
/// through Postgres before a device reads it back (INV-02).
pub fn stored(value: f64, scale: i32) -> f64 {
    let factor = 10_f64.powi(scale);
    (value * factor).round() / factor
}

/// The seeded increments, both unit systems: metric in kilograms, imperial as the exact kilogram
/// equivalent of a pound step, stored at `numeric(10,6)` as `modality_increments` holds them.
pub fn increment() -> impl Strategy<Value = (f64, Option<f64>)> {
    prop_oneof![
        prop::sample::select(vec![0.5, 1.0, 1.25, 2.0, 2.5, 5.0]).prop_map(|kg| (kg, None)),
        prop::sample::select(vec![1.0, 2.5, 5.0, 10.0])
            .prop_map(|lb| (stored(lb * KG_PER_LB, 6), Some(lb))),
    ]
}

pub fn rounding() -> impl Strategy<Value = RoundingMode> {
    prop::sample::select(vec![
        RoundingMode::Nearest,
        RoundingMode::Down,
        RoundingMode::Up,
    ])
}

pub fn set_type() -> impl Strategy<Value = SetType> {
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
pub fn load_step(step_kg: f64) -> impl Strategy<Value = LoadStep> {
    prop_oneof![
        (1_u32..=4).prop_map(move |n| LoadStep::Kg(f64::from(n) * step_kg)),
        (1_u32..=1_000).prop_map(LoadStep::BasisPoints),
    ]
}

/// Any of the five v1 strategies, with the parameters each carries — an empty wave, a missing RIR
/// start or end and a zero rep step included, since the engine must be total over all of them.
pub fn strategy(step_kg: f64) -> impl Strategy<Value = Progression> {
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

/// FR-3.11's three policies, at any reduction.
pub fn failure_policy() -> impl Strategy<Value = FailurePolicy> {
    prop_oneof![
        Just(FailurePolicy::Hold),
        Just(FailurePolicy::RepeatCycle),
        (1_u32..=10_000).prop_map(|load_bp| FailurePolicy::ReduceLoad { load_bp }),
    ]
}

pub fn rir_mode() -> impl Strategy<Value = RirMode> {
    prop_oneof![
        Just(RirMode::PerExercise),
        prop::collection::vec(-4_i32..=4, 0..=6).prop_map(|offsets| RirMode::PerSet { offsets }),
    ]
}

/// One exercise of cycle 1: a rule of any strategy, and up to six sets whose targets may sit outside
/// the rule's bounds, so the clamp is exercised rather than assumed. A bodyweight exercise, with or
/// without a body weight, for `percent_1rm`'s added load.
pub fn exercise(
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
        failure_policy(),
    )
        .prop_map(
            |(
                strategy,
                min_reps,
                rep_span,
                min_rir,
                rir_span,
                rounding,
                rir_mode,
                failure_policy,
            )| Rule {
                strategy,
                min_reps,
                max_reps: min_reps + rep_span,
                min_rir,
                max_rir: (min_rir + rir_span).min(10),
                rounding,
                rir_mode,
                failure_policy,
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
pub fn cycle_one(increment_kg: f64, step_kg: f64) -> impl Strategy<Value = Vec<SessionSpec>> {
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

pub fn deload_policy(num_microcycles: u32) -> impl Strategy<Value = DeloadPolicy> {
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
pub fn mesocycle(num_microcycles: u32) -> impl Strategy<Value = MesocycleSpec> {
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
pub fn block(cycles: std::ops::RangeInclusive<u32>) -> impl Strategy<Value = Block> {
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
pub struct Block {
    pub mesocycle: MesocycleSpec,
    pub cycle_one: Vec<SessionSpec>,
    pub increment_kg: f64,
    /// The pound step, when the increment is an imperial one.
    pub lb: Option<f64>,
}
