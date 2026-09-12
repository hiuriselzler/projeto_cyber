"""The shared fixture is well-formed, checked the same way Jest checks it.

This validates the fixture's own consistency, not an implementation: round_to_increment arrives with
the ADR-004 spike, and runs these same cases then.
"""

import math

from tests.fixtures.loader import load_fixture

EPSILON = 1e-9


def test_round_to_increment_cases_are_consistent():
    fixture = load_fixture("round_to_increment")

    assert fixture["function"] == "round_to_increment"
    assert fixture["cases"]
    for case in fixture["cases"]:
        weight, increment = case["weight_kg"], case["increment_kg"]
        steps, mode = case["expected_steps"], case["mode"]
        load = steps * increment

        assert increment > 0, case["name"]
        assert isinstance(steps, int), case["name"]
        if mode == "down":
            assert load <= weight + EPSILON, case["name"]
            assert weight - load < increment, case["name"]
        elif mode == "up":
            assert load >= weight - EPSILON, case["name"]
            assert load - weight < increment, case["name"]
        else:
            assert mode == "nearest", case["name"]
            assert math.fabs(load - weight) <= increment / 2 + EPSILON, case["name"]
