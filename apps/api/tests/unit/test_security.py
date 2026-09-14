"""Passwords, access tokens and opaque tokens (04 §2, §3; ADR-007)."""

import json
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import REPO_ROOT
from app.core.security import (
    ACCESS_TOKEN_CLAIMS,
    ACCESS_TOKEN_TTL,
    LOGIN_HASH,
    Argon2Parameters,
    InvalidAccessTokenError,
    PasswordHasher,
    hash_opaque_token,
    issue_access_token,
    new_opaque_token,
    read_access_token,
    wrapping_kdf_is_strong_enough,
)

SECRET = "k7Qp2vX9mB4nR8sT1wY6zC3dF5gH0jL2aE9uI4oP7"
NOW = datetime(2026, 9, 14, 12, 0, tzinfo=UTC)
CHEAP = Argon2Parameters(memory_kib=8, iterations=1, parallelism=1)


# --- the login hash and the floor it sets ---------------------------------------------------------


def test_the_login_hash_is_the_cost_recorded_in_the_shared_floor():
    """The app's wrapping KDF is held at or above this file by its own test (ADR-007)."""
    floor_file = REPO_ROOT / "packages" / "shared" / "security" / "password-kdf.json"
    floor = json.loads(floor_file.read_text(encoding="utf-8"))["login_hash"]

    assert floor == {
        "algorithm": "argon2id",
        "memory_kib": LOGIN_HASH.memory_kib,
        "iterations": LOGIN_HASH.iterations,
        "parallelism": LOGIN_HASH.parallelism,
    }


async def test_the_production_hasher_records_its_parameters_in_the_hash():
    encoded = await PasswordHasher().hash("plum-orbit-quarry-7412")

    assert encoded.startswith("$argon2id$v=19$m=65536,t=3,p=4$")


async def test_a_password_verifies_against_its_own_hash_only():
    hasher = PasswordHasher(CHEAP)
    encoded = await hasher.hash("plum-orbit-quarry-7412")

    assert await hasher.verify(encoded, "plum-orbit-quarry-7412")
    assert not await hasher.verify(encoded, "plum-orbit-quarry-7413")
    assert not await hasher.verify("not an argon2 hash", "plum-orbit-quarry-7412")


async def test_a_hash_under_older_parameters_asks_to_be_rehashed():
    older = await PasswordHasher(CHEAP).hash("plum-orbit-quarry-7412")
    stronger = PasswordHasher(Argon2Parameters(memory_kib=16, iterations=2, parallelism=1))

    assert stronger.needs_rehash(older)
    assert not PasswordHasher(CHEAP).needs_rehash(older)


@pytest.mark.parametrize(
    ("kdf", "accepted"),
    [
        ("argon2id$m=65536,t=3,p=1", True),
        ("argon2id$m=131072,t=4,p=1", True),
        ("argon2id$m=32768,t=3,p=1", False),
        ("argon2id$m=65536,t=2,p=1", False),
        ("argon2i$m=65536,t=3,p=1", False),
        ("argon2id$m=65536,t=3", False),
        ("", False),
    ],
)
def test_a_wrapping_kdf_cheaper_than_the_login_hash_is_refused(kdf, accepted):
    assert wrapping_kdf_is_strong_enough(kdf) is accepted


# --- access tokens --------------------------------------------------------------------------------


def test_an_access_token_carries_exactly_five_claims_and_lives_fifteen_minutes():
    user_id = uuid.uuid4()
    token, expires_at = issue_access_token(SECRET, user_id=user_id, device_id="phone", now=NOW)
    claims = jwt.decode(token, SECRET, algorithms=["HS256"], options={"verify_exp": False})

    assert set(claims) == ACCESS_TOKEN_CLAIMS == {"sub", "jti", "exp", "iat", "device_id"}
    assert expires_at - NOW == ACCESS_TOKEN_TTL == timedelta(minutes=15)
    read = read_access_token(SECRET, token, now=NOW + timedelta(minutes=14))
    assert (read.user_id, read.device_id) == (user_id, "phone")


def test_an_expired_access_token_is_refused():
    token, _ = issue_access_token(SECRET, user_id=uuid.uuid4(), device_id="phone", now=NOW)

    with pytest.raises(InvalidAccessTokenError):
        read_access_token(SECRET, token, now=NOW + ACCESS_TOKEN_TTL)


def test_a_token_signed_with_another_secret_is_refused():
    token, _ = issue_access_token(SECRET, user_id=uuid.uuid4(), device_id="phone", now=NOW)

    with pytest.raises(InvalidAccessTokenError):
        read_access_token(SECRET[::-1], token, now=NOW)


def test_a_token_with_any_other_claim_is_refused():
    """An email in a token is PII in every log that prints a header (04 §3)."""
    claims = {
        "sub": str(uuid.uuid4()),
        "jti": "x",
        "iat": int(NOW.timestamp()),
        "exp": int((NOW + ACCESS_TOKEN_TTL).timestamp()),
        "device_id": "phone",
        "email": "user@example.com",
    }

    with pytest.raises(InvalidAccessTokenError):
        read_access_token(SECRET, jwt.encode(claims, SECRET, algorithm="HS256"), now=NOW)


def test_an_unsigned_token_is_refused():
    claims = {
        "sub": str(uuid.uuid4()),
        "jti": "x",
        "iat": int(NOW.timestamp()),
        "exp": int((NOW + ACCESS_TOKEN_TTL).timestamp()),
        "device_id": "phone",
    }
    unsigned = jwt.encode(claims, key=None, algorithm="none")

    with pytest.raises(InvalidAccessTokenError):
        read_access_token(SECRET, unsigned, now=NOW)


# --- opaque tokens --------------------------------------------------------------------------------


def test_opaque_tokens_are_256_bits_and_stored_as_their_sha256():
    token = new_opaque_token()

    assert len(token) >= 43
    assert token != new_opaque_token()
    assert len(hash_opaque_token(token)) == 64
    assert hash_opaque_token(token) != token
