"""What a new password must be (04 §2), and the bundled breach list behind it (ADR-015 §3)."""

import re

import pytest

from app.core.passwords import BREACH_LIST, MAX_LENGTH, MIN_LENGTH, password_problem
from scripts.build_breach_list import SOURCE_SHA256


def digests() -> list[str]:
    lines = BREACH_LIST.read_text(encoding="ascii").splitlines()
    return [line for line in lines if line and not line.startswith("#")]


def test_the_breach_list_is_the_verified_source_cut_to_what_a_user_could_choose():
    header = BREACH_LIST.read_text(encoding="ascii")

    assert SOURCE_SHA256 in header
    assert len(digests()) == 9248
    assert digests() == sorted(set(digests()))
    assert all(re.fullmatch(r"[0-9a-f]{40}", digest) for digest in digests())


@pytest.mark.parametrize("password", ["1234567890", "qwertyuiop", "1q2w3e4r5t", "password123"])
def test_a_common_breached_password_is_refused(password):
    assert password_problem(password) == "breached"


def test_a_breached_password_is_refused_whatever_its_case():
    assert password_problem("QWERTYUIOP") == "breached"


def test_a_password_shorter_than_ten_characters_is_refused_before_anything_else():
    assert MIN_LENGTH == 10
    assert password_problem("123456789") == "too_short"


def test_length_is_the_only_composition_rule():
    assert password_problem("plum-orbit-quarry-7412") is None
    assert password_problem("all lowercase words here") is None


def test_a_password_past_the_upper_bound_is_refused():
    assert password_problem("x" * (MAX_LENGTH + 1)) == "too_long"
