"""What a new password must be (04 §2): ten characters or more, and not on the breach list
(ADR-015).

Length is the only composition rule — composition rules push people toward `Password1!`. The upper
bound is not a policy; it keeps a megabyte of "password" from buying a megabyte of argon2id input.
"""

import hashlib
from functools import lru_cache
from pathlib import Path
from typing import Literal

MIN_LENGTH = 10
MAX_LENGTH = 1024

# The NCSC's top 100 000 from Pwned Passwords, cut to entries of MIN_LENGTH or more and stored as
# SHA-1 digests. Rebuilt by `uv run python -m scripts.build_breach_list` (ADR-015 §3).
BREACH_LIST = Path(__file__).resolve().parent / "data" / "breached_passwords.sha1"

PasswordProblem = Literal["too_short", "too_long", "breached"]


@lru_cache
def _breached_digests() -> frozenset[str]:
    lines = BREACH_LIST.read_text(encoding="ascii").splitlines()
    return frozenset(line for line in lines if line and not line.startswith("#"))


def breach_digest(candidate: str) -> str:
    # A lookup key into a public list, not a way of protecting anything.
    return hashlib.sha1(candidate.encode("utf-8"), usedforsecurity=False).hexdigest()


def password_problem(password: str) -> PasswordProblem | None:
    if len(password) < MIN_LENGTH:
        return "too_short"
    if len(password) > MAX_LENGTH:
        return "too_long"
    digests = _breached_digests()
    if breach_digest(password) in digests or breach_digest(password.lower()) in digests:
        return "breached"
    return None
