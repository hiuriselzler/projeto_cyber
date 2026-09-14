"""Password hashing, access tokens and opaque tokens (04 §2, §3). Nothing here logs a password or a
token."""

import asyncio
import hashlib
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

import jwt
from argon2 import PasswordHasher as Argon2
from argon2 import Type
from argon2.exceptions import InvalidHashError, VerificationError

ACCESS_TOKEN_TTL = timedelta(minutes=15)
REFRESH_TOKEN_TTL = timedelta(days=60)
JWT_ALGORITHM = "HS256"
# 256 bits: high entropy, so SHA-256 is the right hash for storing them and a slow KDF buys nothing
# (04 §3).
OPAQUE_TOKEN_BYTES = 32

ACCESS_TOKEN_CLAIMS = frozenset({"sub", "jti", "exp", "iat", "device_id"})


@dataclass(frozen=True)
class Argon2Parameters:
    memory_kib: int
    iterations: int
    parallelism: int


# 04 §2. packages/shared/security/password-kdf.json records the same numbers, and the app's privacy-
# key wrapping KDF may never be cheaper (ADR-007): a test on each side holds the two together.
LOGIN_HASH = Argon2Parameters(memory_kib=65_536, iterations=3, parallelism=4)


class PasswordHasher:
    """argon2id, off the event loop: at 64 MiB a hash is a quarter of a second of CPU (NFR-12)."""

    def __init__(self, parameters: Argon2Parameters = LOGIN_HASH) -> None:
        self.parameters = parameters
        self._argon2 = Argon2(
            time_cost=parameters.iterations,
            memory_cost=parameters.memory_kib,
            parallelism=parameters.parallelism,
            hash_len=32,
            salt_len=16,
            type=Type.ID,
        )
        # Verified against when no account matches, so a missing email costs what a wrong password
        # costs.
        self._absent_account_hash = self._argon2.hash(secrets.token_urlsafe(16))

    async def hash(self, password: str) -> str:
        return await asyncio.to_thread(self._argon2.hash, password)

    async def verify(self, password_hash: str, password: str) -> bool:
        return await asyncio.to_thread(self._verify, password_hash, password)

    async def verify_absent_account(self, password: str) -> None:
        """Spends a real verification's time and learns nothing (04 §2: constant-time login)."""
        await self.verify(self._absent_account_hash, password)

    def needs_rehash(self, password_hash: str) -> bool:
        return self._argon2.check_needs_rehash(password_hash)

    def _verify(self, password_hash: str, password: str) -> bool:
        try:
            return self._argon2.verify(password_hash, password)
        except (VerificationError, InvalidHashError):
            return False


_KDF = re.compile(r"argon2id\$m=(\d{1,9}),t=(\d{1,4}),p=(\d{1,3})")


def wrapping_kdf_is_strong_enough(kdf: str, floor: Argon2Parameters = LOGIN_HASH) -> bool:
    """A privacy-key wrap is a password-guessing oracle, so its KDF is never cheaper than the login
    hash (ADR-007).

    The server cannot see the derivation, only the parameters the app says it used; refusing weaker
    ones keeps a modified or outdated client from storing a cheap oracle beside the real hash.
    """
    match = _KDF.fullmatch(kdf)
    if match is None:
        return False
    memory_kib, iterations, parallelism = (int(group) for group in match.groups())
    return memory_kib >= floor.memory_kib and iterations >= floor.iterations and parallelism >= 1


# --- access tokens --------------------------------------------------------------------------------


class InvalidAccessTokenError(Exception):
    """Unreadable, forged, expired, or carrying claims it should not."""


@dataclass(frozen=True)
class AccessClaims:
    user_id: uuid.UUID
    device_id: str
    token_id: str
    expires_at: datetime


def issue_access_token(
    secret: str, *, user_id: uuid.UUID, device_id: str, now: datetime
) -> tuple[str, datetime]:
    """A 15-minute JWT whose claims are exactly `sub`, `jti`, `exp`, `iat` and `device_id` — never
    PII (04 §3)."""
    expires_at = now + ACCESS_TOKEN_TTL
    claims = {
        "sub": str(user_id),
        "jti": uuid.uuid4().hex,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "device_id": device_id,
    }
    return jwt.encode(claims, secret, algorithm=JWT_ALGORITHM), expires_at


def read_access_token(secret: str, token: str, *, now: datetime) -> AccessClaims:
    try:
        # Expiry is checked against the injected clock below, not the system's.
        claims = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            options={
                "require": sorted(ACCESS_TOKEN_CLAIMS),
                "verify_exp": False,
                "verify_iat": False,
            },
        )
        if set(claims) != ACCESS_TOKEN_CLAIMS or not isinstance(claims["device_id"], str):
            raise InvalidAccessTokenError
        if int(claims["exp"]) <= now.timestamp():
            raise InvalidAccessTokenError
        return AccessClaims(
            user_id=uuid.UUID(claims["sub"]),
            device_id=claims["device_id"],
            token_id=str(claims["jti"]),
            expires_at=datetime.fromtimestamp(int(claims["exp"]), now.tzinfo),
        )
    except (jwt.PyJWTError, ValueError, TypeError):
        raise InvalidAccessTokenError from None


# --- opaque tokens: refresh, password reset, email verification -----------------------------------


def new_opaque_token() -> str:
    return secrets.token_urlsafe(OPAQUE_TOKEN_BYTES)


def hash_opaque_token(token: str) -> str:
    """What the database stores in place of the token (04 §2a, §3)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
