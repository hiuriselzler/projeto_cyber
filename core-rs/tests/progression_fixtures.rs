//! The planner's shared fixtures, run against the Rust core — task 005.
//!
//! `packages/shared/fixtures/generate.json` and `resolve_dates.json` are the same files pytest runs
//! through PyO3 and the app runs on the device through UniFFI, so these prove the core, and the other two
//! prove their bindings marshal it faithfully. Fixture #1 is the owner's own 40 → 62.5 kg example.
//!
//! **Dates are ISO in the files and whole days since 1970-01-01 in the core** (stage 1, decision 6), so
//! each consumer converts with its own calendar. Rust's standard library has none, which is why
//! [`epoch_day`] is written out here — in the test binary, never in the library.

use cyberathlete_core::{
    CycleOneSet, DeloadPolicy, ENGINE_VERSION, EpochDay, ExerciseSpec, LengthOverride, LoadStep,
    MesocycleSpec, PlannedMicrocycle, PlannedSet, RoundingMode, Rule, SessionSpec, SetType,
    Strategy, generate, resolve_dates,
};
use serde::Deserialize;

fn load<T: serde::de::DeserializeOwned>(name: &str) -> T {
    let path = format!(
        "{}/../packages/shared/fixtures/{name}",
        env!("CARGO_MANIFEST_DIR")
    );
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("{path} must be readable: {error}"));
    serde_json::from_str(&raw).unwrap_or_else(|error| panic!("{path} must parse: {error}"))
}

/// Days since 1970-01-01 for a proleptic Gregorian `YYYY-MM-DD` — Howard Hinnant's `days_from_civil`.
fn epoch_day(iso: &str) -> EpochDay {
    let parts: Vec<i64> = iso
        .split('-')
        .map(|part| part.parse().unwrap_or_else(|_| panic!("bad date {iso:?}")))
        .collect();
    let [year, month, day] = parts[..] else {
        panic!("bad date {iso:?}");
    };
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let day_of_year = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    EpochDay::try_from(era * 146_097 + day_of_era - 719_468).expect("a date inside i32 days")
}

#[test]
fn the_date_helper_agrees_with_the_calendar() {
    assert_eq!(epoch_day("1970-01-01"), 0);
    assert_eq!(epoch_day("2000-03-01"), 11_017);
    assert_eq!(epoch_day("2026-10-05"), 20_731);
    assert_eq!(epoch_day("1969-12-31"), -1);
}

#[derive(Deserialize)]
struct Fixture<C> {
    cases: Vec<C>,
}

// ── resolve_dates ────────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DatesCase {
    name: String,
    start_date: String,
    length_days: Vec<u32>,
    expected: Vec<String>,
}

#[test]
fn every_resolve_dates_case_agrees() {
    let fixture: Fixture<DatesCase> = load("resolve_dates.json");
    assert!(!fixture.cases.is_empty(), "the fixture must hold cases");

    for case in &fixture.cases {
        let expected: Vec<EpochDay> = case.expected.iter().map(|it| epoch_day(it)).collect();
        assert_eq!(
            resolve_dates(epoch_day(&case.start_date), &case.length_days),
            expected,
            "case {:?}",
            case.name
        );
    }
}

// ── generate ─────────────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GenerateCase {
    name: String,
    mesocycle: FixtureMesocycle,
    cycle_one: Vec<FixtureSession>,
    expected: Vec<FixtureCycle>,
    #[allow(dead_code, reason = "prose for the reader; nothing to assert against")]
    note: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FixtureMesocycle {
    start_date: String,
    num_microcycles: u32,
    default_length_days: u32,
    length_overrides: Vec<FixtureOverride>,
    deload: FixtureDeload,
    deload_set_bp: u32,
    deload_load_bp: u32,
    deload_rir_bump: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FixtureOverride {
    cycle_number: u32,
    length_days: u32,
}

#[derive(Deserialize)]
#[serde(tag = "mode", rename_all = "snake_case", deny_unknown_fields)]
enum FixtureDeload {
    None,
    EveryNMicrocycles { every: u32, final_cycle: bool },
    Manual { cycles: Vec<u32> },
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FixtureSession {
    day_index: u32,
    order_index: u32,
    exercises: Vec<FixtureExercise>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FixtureExercise {
    order_index: u32,
    increment_kg: f64,
    rule: FixtureRule,
    sets: Vec<FixtureCycleOneSet>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FixtureRule {
    strategy: String,
    load_step_kg: Option<f64>,
    load_step_bp: Option<u32>,
    min_reps: u32,
    max_reps: u32,
    min_rir: u32,
    max_rir: u32,
    rounding: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FixtureCycleOneSet {
    set_index: u32,
    set_type: String,
    target_weight_kg: Option<f64>,
    target_reps: Option<u32>,
    target_rir: Option<u32>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FixtureCycle {
    cycle_number: u32,
    starts_on: String,
    length_days: u32,
    is_deload: bool,
    sessions: Vec<FixturePlannedSession>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FixturePlannedSession {
    day_index: u32,
    order_index: u32,
    exercises: Vec<FixturePlannedExercise>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FixturePlannedExercise {
    order_index: u32,
    sets: Vec<FixturePlannedSet>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FixturePlannedSet {
    set_index: u32,
    set_type: String,
    target_weight_kg: Option<f64>,
    target_weight_steps: Option<i64>,
    target_reps: Option<u32>,
    target_rir: Option<u32>,
    was_clamped: bool,
}

fn set_type(name: &str) -> SetType {
    SetType::from_name(name).unwrap_or_else(|| panic!("unknown set type {name:?}"))
}

fn build_rule(rule: &FixtureRule) -> Rule {
    let strategy = match (rule.strategy.as_str(), rule.load_step_kg, rule.load_step_bp) {
        ("fixed", None, None) => Strategy::Fixed,
        ("linear_load", Some(kg), None) => Strategy::LinearLoad(LoadStep::Kg(kg)),
        ("linear_load", None, Some(bp)) => Strategy::LinearLoad(LoadStep::BasisPoints(bp)),
        (other, kg, bp) => panic!("no stage-1 rule is {other:?} with step {kg:?} kg / {bp:?} bp"),
    };
    Rule {
        strategy,
        min_reps: rule.min_reps,
        max_reps: rule.max_reps,
        min_rir: rule.min_rir,
        max_rir: rule.max_rir,
        rounding: RoundingMode::from_name(&rule.rounding)
            .unwrap_or_else(|| panic!("unknown rounding {:?}", rule.rounding)),
    }
}

fn build_mesocycle(mesocycle: &FixtureMesocycle) -> MesocycleSpec {
    MesocycleSpec {
        start_day: epoch_day(&mesocycle.start_date),
        num_microcycles: mesocycle.num_microcycles,
        default_length_days: mesocycle.default_length_days,
        length_overrides: mesocycle
            .length_overrides
            .iter()
            .map(|it| LengthOverride {
                cycle_number: it.cycle_number,
                length_days: it.length_days,
            })
            .collect(),
        deload: match &mesocycle.deload {
            FixtureDeload::None => DeloadPolicy::None,
            FixtureDeload::EveryNMicrocycles { every, final_cycle } => DeloadPolicy::EveryN {
                every: *every,
                final_cycle: *final_cycle,
            },
            FixtureDeload::Manual { cycles } => DeloadPolicy::Manual {
                cycles: cycles.clone(),
            },
        },
        deload_set_bp: mesocycle.deload_set_bp,
        deload_load_bp: mesocycle.deload_load_bp,
        deload_rir_bump: mesocycle.deload_rir_bump,
    }
}

fn build_cycle_one(sessions: &[FixtureSession]) -> Vec<SessionSpec> {
    sessions
        .iter()
        .map(|session| SessionSpec {
            day_index: session.day_index,
            order_index: session.order_index,
            exercises: session
                .exercises
                .iter()
                .map(|exercise| ExerciseSpec {
                    order_index: exercise.order_index,
                    increment_kg: exercise.increment_kg,
                    rule: build_rule(&exercise.rule),
                    sets: exercise
                        .sets
                        .iter()
                        .map(|set| CycleOneSet {
                            set_index: set.set_index,
                            set_type: set_type(&set.set_type),
                            target_weight_kg: set.target_weight_kg,
                            target_reps: set.target_reps,
                            target_rir: set.target_rir,
                        })
                        .collect(),
                })
                .collect(),
        })
        .collect()
}

/// The expected block, as the core's own types. A load written as steps is multiplied out here, in this
/// runtime's arithmetic, from the increment of the exercise at the same place in cycle 1 — so the file
/// never asserts a float it could not write exactly.
fn build_expected(case: &GenerateCase) -> Vec<PlannedMicrocycle> {
    let increment = |exercise_order: u32| -> f64 {
        case.cycle_one
            .iter()
            .flat_map(|session| &session.exercises)
            .find(|exercise| exercise.order_index == exercise_order)
            .map_or(f64::NAN, |exercise| exercise.increment_kg)
    };
    case.expected
        .iter()
        .map(|cycle| PlannedMicrocycle {
            cycle_number: cycle.cycle_number,
            length_days: cycle.length_days,
            starts_on: epoch_day(&cycle.starts_on),
            is_deload: cycle.is_deload,
            engine_version: ENGINE_VERSION,
            sessions: cycle
                .sessions
                .iter()
                .map(|session| cyberathlete_core::PlannedSession {
                    day_index: session.day_index,
                    order_index: session.order_index,
                    exercises: session
                        .exercises
                        .iter()
                        .map(|exercise| cyberathlete_core::PlannedExercise {
                            order_index: exercise.order_index,
                            sets: exercise
                                .sets
                                .iter()
                                .map(|set| PlannedSet {
                                    set_index: set.set_index,
                                    set_type: set_type(&set.set_type),
                                    target_weight_kg: set.target_weight_kg.or_else(|| {
                                        set.target_weight_steps.map(|steps| {
                                            steps as f64 * increment(exercise.order_index)
                                        })
                                    }),
                                    target_reps: set.target_reps,
                                    target_rir: set.target_rir,
                                    was_clamped: set.was_clamped,
                                })
                                .collect(),
                        })
                        .collect(),
                })
                .collect(),
        })
        .collect()
}

#[test]
fn every_generate_case_agrees() {
    let fixture: Fixture<GenerateCase> = load("generate.json");
    assert!(!fixture.cases.is_empty(), "the fixture must hold cases");

    for case in &fixture.cases {
        let actual = generate(
            &build_mesocycle(&case.mesocycle),
            &build_cycle_one(&case.cycle_one),
        );
        let expected = build_expected(case);

        assert_eq!(
            actual.len(),
            expected.len(),
            "case {:?}: cycle count",
            case.name
        );
        // Cycle by cycle, so a failure names the cycle rather than printing a whole block.
        for (got, want) in actual.iter().zip(&expected) {
            assert_eq!(
                got, want,
                "case {:?}, cycle {}",
                case.name, want.cycle_number
            );
        }
    }
}

#[test]
fn fixture_one_reads_as_the_owner_s_table() {
    // The owner's example, spelled out a second way so a mistyped fixture cannot pass by agreeing with
    // a mistyped engine: the first set's load, cycle by cycle, from 00 § Worked example.
    let fixture: Fixture<GenerateCase> = load("generate.json");
    let case = fixture
        .cases
        .iter()
        .find(|it| it.name.starts_with("fixture #1"))
        .expect("fixture #1 is in generate.json");
    let block = generate(
        &build_mesocycle(&case.mesocycle),
        &build_cycle_one(&case.cycle_one),
    );
    let loads: Vec<Option<f64>> = block
        .iter()
        .map(|cycle| cycle.sessions[0].exercises[0].sets[0].target_weight_kg)
        .collect();
    let table = [
        42.5, 45.0, 47.5, 50.0, 30.0, 52.5, 55.0, 57.5, 60.0, 62.5, 37.5,
    ];
    assert_eq!(loads, table.map(Some).to_vec());
}
