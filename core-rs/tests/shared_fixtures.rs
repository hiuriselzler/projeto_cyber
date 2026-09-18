//! The shared fixtures, run against the Rust core.
//!
//! `packages/shared/fixtures/round_to_increment.json` is the same file the Python and TypeScript
//! suites read. Under ADR-004 option B the fixtures are regression tests; under option A they are
//! the tripwire that two implementations have drifted. Either way this suite must pass.
//!
//! The fixture stores `expected_steps`, not a float, so each consumer multiplies in its own
//! arithmetic — a float written into JSON would be asserting the file's rounding, not the code's.

use cyberathlete_core::{RoundingMode, round_to_increment};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixture {
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Case {
    name: String,
    weight_kg: f64,
    increment_kg: f64,
    mode: String,
    expected_steps: i64,
}

#[test]
fn every_shared_case_agrees() {
    // Reading a file is fine here and nowhere else: this is the test binary, not the library.
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../packages/shared/fixtures/round_to_increment.json"
    );
    let raw = std::fs::read_to_string(path).expect("the shared fixture must be readable");
    let fixture: Fixture = serde_json::from_str(&raw).expect("the shared fixture must parse");

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
