//! The shared fixtures, run against the Rust core.
//!
//! `packages/shared/fixtures/` holds the same files the Python and TypeScript suites read:
//! `round_to_increment.json` (INV-02), `e1rm.json` (INV-07), `is_counted_set.json` (INV-04),
//! `pr_detection.json` (FR-2.15), `personal_bests.json` (FR-2.15, task 004 stage 6), and
//! `session_metrics.json` and `standing_records.json` (FR-2.14–2.15, stage 7), and
//! `missing_for_completion.json` (03 §4, stage 8). Under
//! ADR-004 option B all three runtimes reach one Rust
//! implementation, so these prove **the bindings agree** rather than that two hand-written copies
//! have not drifted — and they stay regression tests besides.
//!
//! **No expectation is written as a computed float.** The rounding fixture stores `expected_steps`
//! and e1RM's stores a load and an effective rep count, so each consumer does the arithmetic in its
//! own runtime; a float in the file would assert the file's rounding rather than the code's, and
//! `100 x 37/30` has no exact decimal form to write down. Plain sums and products — a tonnage, a
//! load, a rep count — are exact and are written out.

use cyberathlete_core::{
    LoggedSet, PersonalBests, PrKind, RepsAtWeight, RoundingMode, SetEntry, SetType, Tracking,
    detect_prs, e1rm, is_counted_set, missing_for_completion, personal_bests, round_to_increment,
    session_metrics, standing_records, volume_kg,
};
use serde::Deserialize;

/// Read a fixture from `packages/shared/`. Reading a file is fine here and nowhere else: this is a
/// test binary, not the library.
fn load<T: serde::de::DeserializeOwned>(name: &str) -> T {
    let path = format!(
        "{}/../packages/shared/fixtures/{name}",
        env!("CARGO_MANIFEST_DIR")
    );
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("{path} must be readable: {error}"));
    serde_json::from_str(&raw).unwrap_or_else(|error| panic!("{path} must parse: {error}"))
}

/// A set as the fixtures spell one. Every field is optional and defaults to the `set_defaults`
/// block each file documents, so a case writes only what it is about.
#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct FixtureSet {
    set_type: Option<String>,
    is_completed: Option<bool>,
    weight_kg: Option<f64>,
    reps: Option<u32>,
    rir: Option<u32>,
    uses_bodyweight: Option<bool>,
    body_weight_kg: Option<f64>,
    is_deload: Option<bool>,
}

impl FixtureSet {
    fn build(&self, case: &str) -> LoggedSet {
        let name = self.set_type.as_deref().unwrap_or("working");
        LoggedSet {
            set_type: SetType::from_name(name)
                .unwrap_or_else(|| panic!("unknown set type {name:?} in case {case:?}")),
            is_completed: self.is_completed.unwrap_or(true),
            weight_kg: self.weight_kg,
            reps: self.reps,
            rir: self.rir,
            uses_bodyweight: self.uses_bodyweight.unwrap_or(false),
            body_weight_kg: self.body_weight_kg,
            is_deload: self.is_deload.unwrap_or(false),
        }
    }
}

#[derive(Deserialize)]
struct Fixture<C> {
    cases: Vec<C>,
}

#[derive(Deserialize)]
struct RoundingCase {
    name: String,
    weight_kg: f64,
    increment_kg: f64,
    mode: String,
    expected_steps: i64,
}

#[test]
fn every_rounding_case_agrees() {
    let fixture: Fixture<RoundingCase> = load("round_to_increment.json");
    assert!(!fixture.cases.is_empty(), "the fixture must hold cases");

    for case in &fixture.cases {
        let mode = RoundingMode::from_name(&case.mode)
            .unwrap_or_else(|| panic!("unknown mode {:?} in case {:?}", case.mode, case.name));
        let expected = case.expected_steps as f64 * case.increment_kg;
        let actual = round_to_increment(case.weight_kg, case.increment_kg, mode);

        assert_eq!(
            actual, expected,
            "case {:?}: {} kg to a {} kg step, {} → expected {} steps",
            case.name, case.weight_kg, case.increment_kg, case.mode, case.expected_steps
        );
    }
}

#[derive(Deserialize)]
struct E1rmCase {
    name: String,
    set: FixtureSet,
    expected: Option<E1rmExpectation>,
}

#[derive(Deserialize)]
struct E1rmExpectation {
    load_kg: f64,
    effective_reps: u32,
}

#[test]
fn every_e1rm_case_agrees() {
    let fixture: Fixture<E1rmCase> = load("e1rm.json");
    assert!(!fixture.cases.is_empty(), "the fixture must hold cases");

    for case in &fixture.cases {
        let actual = e1rm(&case.set.build(&case.name));
        // Computed here rather than read as a float: the fixture states the load and the effective
        // rep count, and each consumer applies Epley in its own arithmetic (INV-07).
        let expected = case
            .expected
            .as_ref()
            .map(|it| it.load_kg * (1.0 + f64::from(it.effective_reps) / 30.0));

        assert_eq!(actual, expected, "case {:?}", case.name);
    }
}

#[derive(Deserialize)]
struct CountedCase {
    name: String,
    set: FixtureSet,
    expected: bool,
}

#[test]
fn every_is_counted_set_case_agrees() {
    let fixture: Fixture<CountedCase> = load("is_counted_set.json");
    assert!(!fixture.cases.is_empty(), "the fixture must hold cases");

    for case in &fixture.cases {
        assert_eq!(
            is_counted_set(&case.set.build(&case.name)),
            case.expected,
            "case {:?}",
            case.name
        );
    }
}

#[derive(Deserialize)]
struct PrCase {
    name: String,
    previous: FixtureBests,
    session: Vec<FixtureSet>,
    expected: Vec<ExpectedPr>,
    #[allow(dead_code, reason = "prose for the reader; nothing to assert against")]
    note: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct FixtureBests {
    max_weight_kg: Option<f64>,
    best_e1rm_kg: Option<f64>,
    best_session_volume_kg: Option<f64>,
    best_reps_at_weight: Option<Vec<FixtureRepsAtWeight>>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FixtureRepsAtWeight {
    weight_kg: f64,
    reps: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExpectedPr {
    kind: String,
    value: Option<f64>,
    weight_kg: Option<f64>,
    set_index: Option<u32>,
}

#[test]
fn every_pr_detection_case_agrees() {
    let fixture: Fixture<PrCase> = load("pr_detection.json");
    assert!(!fixture.cases.is_empty(), "the fixture must hold cases");

    for case in &fixture.cases {
        let previous = PersonalBests {
            max_weight_kg: case.previous.max_weight_kg,
            best_e1rm_kg: case.previous.best_e1rm_kg,
            best_session_volume_kg: case.previous.best_session_volume_kg,
            best_reps_at_weight: case
                .previous
                .best_reps_at_weight
                .as_deref()
                .unwrap_or_default()
                .iter()
                .map(|best| RepsAtWeight {
                    weight_kg: best.weight_kg,
                    reps: best.reps,
                })
                .collect(),
        };
        let session: Vec<LoggedSet> = case
            .session
            .iter()
            .map(|set| set.build(&case.name))
            .collect();

        let actual = detect_prs(&previous, &session);

        // The order is asserted along with the contents: it is part of the contract, because two
        // devices showing a celebration must show the same one first.
        let actual_kinds: Vec<&str> = actual.iter().map(|pr| pr.kind.name()).collect();
        let expected_kinds: Vec<&str> = case.expected.iter().map(|pr| pr.kind.as_str()).collect();
        assert_eq!(actual_kinds, expected_kinds, "case {:?}", case.name);

        for (got, want) in actual.iter().zip(&case.expected) {
            assert!(
                PrKind::from_name(&want.kind).is_some(),
                "unknown pr kind {:?} in case {:?}",
                want.kind,
                case.name
            );
            if let Some(value) = want.value {
                assert_eq!(
                    got.value, value,
                    "case {:?}, {} value",
                    case.name, want.kind
                );
            }
            if let Some(weight_kg) = want.weight_kg {
                assert_eq!(
                    got.weight_kg,
                    Some(weight_kg),
                    "case {:?}, {} weight",
                    case.name,
                    want.kind
                );
            }
            assert_eq!(
                got.set_index, want.set_index,
                "case {:?}, {} set index",
                case.name, want.kind
            );
        }
    }
}

#[derive(Deserialize)]
struct BestsCase {
    name: String,
    sessions: Vec<Vec<FixtureSet>>,
    expected: ExpectedBests,
    #[allow(dead_code, reason = "prose for the reader; nothing to assert against")]
    note: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExpectedBests {
    max_weight_kg: Option<f64>,
    best_e1rm: Option<E1rmExpectation>,
    best_session_volume_kg: Option<f64>,
    best_reps_at_weight: Vec<FixtureRepsAtWeight>,
}

#[test]
fn every_personal_bests_case_agrees() {
    let fixture: Fixture<BestsCase> = load("personal_bests.json");
    assert!(!fixture.cases.is_empty(), "the fixture must hold cases");

    for case in &fixture.cases {
        let sessions: Vec<Vec<LoggedSet>> = case
            .sessions
            .iter()
            .map(|session| session.iter().map(|set| set.build(&case.name)).collect())
            .collect();
        let actual = personal_bests(&sessions);

        assert_eq!(
            actual.max_weight_kg, case.expected.max_weight_kg,
            "case {:?}, max weight",
            case.name
        );
        // Epley applied here, from the load and effective reps the fixture states (INV-07).
        let e1rm = case
            .expected
            .best_e1rm
            .as_ref()
            .map(|it| it.load_kg * (1.0 + f64::from(it.effective_reps) / 30.0));
        assert_eq!(actual.best_e1rm_kg, e1rm, "case {:?}, best e1RM", case.name);
        assert_eq!(
            actual.best_session_volume_kg, case.expected.best_session_volume_kg,
            "case {:?}, session volume",
            case.name
        );
        let expected_reps: Vec<RepsAtWeight> = case
            .expected
            .best_reps_at_weight
            .iter()
            .map(|best| RepsAtWeight {
                weight_kg: best.weight_kg,
                reps: best.reps,
            })
            .collect();
        assert_eq!(
            actual.best_reps_at_weight, expected_reps,
            "case {:?}, reps at weight",
            case.name
        );
    }
}

fn build_sessions(sessions: &[Vec<FixtureSet>], case: &str) -> Vec<Vec<LoggedSet>> {
    sessions
        .iter()
        .map(|session| session.iter().map(|set| set.build(case)).collect())
        .collect()
}

#[derive(Deserialize)]
struct MetricsCase {
    name: String,
    sessions: Vec<Vec<FixtureSet>>,
    expected: Vec<ExpectedMetrics>,
    #[allow(dead_code, reason = "prose for the reader; nothing to assert against")]
    note: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExpectedMetrics {
    top_load_kg: Option<f64>,
    best_e1rm: Option<E1rmExpectation>,
    volume_kg: Option<f64>,
    counted_sets: u32,
}

#[test]
fn every_session_metrics_case_agrees() {
    let fixture: Fixture<MetricsCase> = load("session_metrics.json");
    assert!(!fixture.cases.is_empty(), "the fixture must hold cases");

    for case in &fixture.cases {
        let actual = session_metrics(&build_sessions(&case.sessions, &case.name));
        assert_eq!(actual.len(), case.expected.len(), "case {:?}", case.name);

        for (at, (got, want)) in actual.iter().zip(&case.expected).enumerate() {
            let label = format!("case {:?}, session {at}", case.name);
            assert_eq!(got.top_load_kg, want.top_load_kg, "{label}, top load");
            // Epley applied here, from the load and effective reps the fixture states (INV-07).
            let e1rm = want
                .best_e1rm
                .as_ref()
                .map(|it| it.load_kg * (1.0 + f64::from(it.effective_reps) / 30.0));
            assert_eq!(got.best_e1rm_kg, e1rm, "{label}, best e1RM");
            assert_eq!(got.volume_kg, want.volume_kg, "{label}, volume");
            assert_eq!(got.counted_sets, want.counted_sets, "{label}, counted sets");
        }
    }
}

#[derive(Deserialize)]
struct StandingCase {
    name: String,
    sessions: Vec<Vec<FixtureSet>>,
    expected: Vec<ExpectedStanding>,
    #[allow(dead_code, reason = "prose for the reader; nothing to assert against")]
    note: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExpectedStanding {
    kind: String,
    value: Option<f64>,
    weight_kg: Option<f64>,
    session_index: u32,
    set_index: Option<u32>,
}

#[test]
fn every_standing_records_case_agrees() {
    let fixture: Fixture<StandingCase> = load("standing_records.json");
    assert!(!fixture.cases.is_empty(), "the fixture must hold cases");

    for case in &fixture.cases {
        let sessions = build_sessions(&case.sessions, &case.name);
        let actual = standing_records(&sessions);

        let actual_kinds: Vec<&str> = actual.iter().map(|held| held.record.kind.name()).collect();
        let expected_kinds: Vec<&str> = case.expected.iter().map(|it| it.kind.as_str()).collect();
        assert_eq!(actual_kinds, expected_kinds, "case {:?}", case.name);

        for (got, want) in actual.iter().zip(&case.expected) {
            let label = format!("case {:?}, {}", case.name, want.kind);
            assert_eq!(got.session_index, want.session_index, "{label}, session");
            assert_eq!(got.record.set_index, want.set_index, "{label}, set");
            assert_eq!(got.record.weight_kg, want.weight_kg, "{label}, weight");
            if let Some(value) = want.value {
                assert_eq!(got.record.value, value, "{label}, value");
            }
            // An e1RM is not written as a float; it must be the e1RM of the set the record names.
            if want.kind == "best_e1rm" {
                let index = want.set_index.expect("an e1RM belongs to a set") as usize;
                let set = &sessions[want.session_index as usize][index];
                assert_eq!(Some(got.record.value), e1rm(set), "{label}, value");
            }
        }

        // The values are personal_bests' — one fold, two views of it.
        let bests = personal_bests(&sessions);
        for held in &actual {
            let best = match held.record.kind {
                PrKind::MaxWeight => bests.max_weight_kg,
                PrKind::BestE1rm => bests.best_e1rm_kg,
                PrKind::BestSessionVolume => bests.best_session_volume_kg,
                PrKind::MaxRepsAtWeight => bests
                    .best_reps_at_weight
                    .iter()
                    .find(|it| Some(it.weight_kg) == held.record.weight_kg)
                    .map(|it| f64::from(it.reps)),
            };
            assert_eq!(best, Some(held.record.value), "case {:?}", case.name);
        }
    }
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct FixtureEntry {
    reps: Option<u32>,
    duration_s: Option<u32>,
    distance_m: Option<f64>,
}

#[derive(Deserialize)]
struct CompletionCase {
    name: String,
    tracking: String,
    set: FixtureEntry,
    expected: Option<String>,
}

#[test]
fn every_missing_for_completion_case_agrees() {
    let fixture: Fixture<CompletionCase> = load("missing_for_completion.json");
    assert!(!fixture.cases.is_empty(), "the fixture must hold cases");

    for case in &fixture.cases {
        let tracking = Tracking::from_name(&case.tracking)
            .unwrap_or_else(|| panic!("unknown tracking {:?} in {:?}", case.tracking, case.name));
        let entry = SetEntry {
            reps: case.set.reps,
            duration_s: case.set.duration_s,
            distance_m: case.set.distance_m,
        };
        let actual = missing_for_completion(tracking, &entry).map(|field| field.name());

        assert_eq!(actual, case.expected.as_deref(), "case {:?}", case.name);
    }
}

#[test]
fn the_pr_fixture_s_session_volumes_are_what_the_core_computes() {
    // The fixture writes a tonnage as a plain number because a sum of products is exact. This
    // checks that claim rather than trusting it: if `volume_kg` and the file ever disagree about
    // what a session is worth, the PR cases above would go on passing for the wrong reason.
    let fixture: Fixture<PrCase> = load("pr_detection.json");

    for case in &fixture.cases {
        let Some(expected) = case
            .expected
            .iter()
            .find(|pr| pr.kind == "best_session_volume")
            .and_then(|pr| pr.value)
        else {
            continue;
        };
        let eligible: Vec<LoggedSet> = case
            .session
            .iter()
            .map(|set| set.build(&case.name))
            .filter(|set| !set.is_deload)
            .collect();
        assert_eq!(volume_kg(&eligible), expected, "case {:?}", case.name);
    }
}
