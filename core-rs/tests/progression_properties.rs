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

mod common;

use common::{KG_PER_LB, block, stored};
use cyberathlete_core::{
    DeloadPolicy, ENGINE_VERSION, MesocycleSpec, PlannedMicrocycle, RoundingMode, Rule,
    SessionSpec, Strategy as Progression, generate, round_to_increment,
};
use proptest::prelude::*;
use std::collections::BTreeSet;

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
