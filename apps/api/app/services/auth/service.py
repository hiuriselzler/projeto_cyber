"""Authentication and the account lifecycle (task 003; 04 §2-§5, ADR-007, ADR-011, ADR-015).

Every flow uses two kinds of transaction. A lookup that has to happen before anyone is known — a
user by email, a token by its hash — goes through `app.repositories.unscoped` in a transaction with
no user scope, and yields only an id. Everything after it runs in a transaction scoped to that id,
through the ordinary repositories, so row-level security holds here exactly as it does for training
data.

argon2id runs between transactions, never inside one: a quarter of a second holding a pooled
connection is how a burst of sign-ins drains the pool (NFR-12). Email goes out after the commit, and
a failure to send never fails the request. The password is never logged, and never kept past the
call that received it.
"""

import ipaddress
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import Clock
from app.core.db import transaction, user_transaction
from app.core.email import EmailMessage, EmailSender, compose
from app.core.i18n import Locale, message
from app.core.passwords import password_problem
from app.core.rate_limit import DEFAULT, LOGIN, REFRESH, REGISTER, SENDS_EMAIL, normalise_account
from app.core.scope import Principal, UserId
from app.core.security import (
    REFRESH_TOKEN_TTL,
    PasswordHasher,
    hash_opaque_token,
    issue_access_token,
    new_opaque_token,
    wrapping_kdf_is_strong_enough,
)
from app.models.identity import EmailVerificationToken, PasswordResetToken, RefreshToken, User
from app.repositories import unscoped
from app.repositories.account_tokens import (
    EmailVerificationTokenRepository,
    PasswordResetTokenRepository,
)
from app.repositories.privacy_zones import PrivacyZoneRepository
from app.repositories.refresh_tokens import RefreshTokenRepository
from app.repositories.users import UserRepository
from app.services.auth.rotation import TokenState, decide_rotation
from app.services.errors import (
    ConflictError,
    EmailNotVerifiedError,
    InvalidCredentialsError,
    InvalidPrivacyKeyError,
    InvalidRequestError,
    InvalidTokenError,
    NotFoundError,
    PasswordRejectedError,
    RefreshRejectedError,
    UnauthenticatedError,
    WrongPasswordError,
)
from app.services.rate_limit import RateLimiter

RESET_TOKEN_TTL = timedelta(minutes=30)
VERIFICATION_TOKEN_TTL = timedelta(hours=24)
# XChaCha20-Poly1305 over the 32-byte key: 24-byte nonce ‖ ciphertext ‖ 16-byte tag (03 §1).
WRAPPED_KEY_BYTES = 24 + 32 + 16
# libsodium's crypto_pwhash_SALTBYTES.
KDF_SALT_BYTES = 16

EDITABLE_ACCOUNT_FIELDS = frozenset(
    {
        "display_name",
        "unit_system",
        "locale",
        "timezone",
        "birth_date",
        "sex",
        "max_hr",
        "resting_hr",
        "gamification_enabled",
    }
)

_logger = structlog.get_logger("app.auth")


# --- what the service takes and gives -------------------------------------------------------------


@dataclass(frozen=True)
class ClientContext:
    ip: str | None


@dataclass(frozen=True)
class WrappedPrivacyKey:
    """The privacy key as the server may hold it: wrapped on the device, with how it was wrapped
    (ADR-007)."""

    wrapped_key: bytes
    salt: bytes
    kdf: str


@dataclass(frozen=True)
class Registration:
    user_id: uuid.UUID
    email: str
    password: str
    display_name: str
    locale: Locale
    unit_system: str
    timezone: str
    device_id: str
    device_name: str | None
    privacy_key: WrappedPrivacyKey


@dataclass(frozen=True)
class LoginAttempt:
    email: str
    password: str
    device_id: str
    device_name: str | None


@dataclass(frozen=True)
class PasswordChange:
    current_password: str
    new_password: str
    privacy_key: WrappedPrivacyKey


@dataclass(frozen=True)
class PasswordReset:
    token: str
    new_password: str
    privacy_key: WrappedPrivacyKey


@dataclass(frozen=True)
class Account:
    id: uuid.UUID
    email: str
    email_verified: bool
    display_name: str
    unit_system: str
    locale: str
    timezone: str
    birth_date: date | None
    sex: str | None
    max_hr: int | None
    resting_hr: int | None
    gamification_enabled: bool
    privacy_key: WrappedPrivacyKey | None
    deletion_requested_at: datetime | None


@dataclass(frozen=True)
class Tokens:
    access_token: str
    access_expires_at: datetime
    refresh_token: str
    refresh_expires_at: datetime


@dataclass(frozen=True)
class SignedIn:
    tokens: Tokens
    account: Account


@dataclass(frozen=True)
class DeviceSession:
    id: uuid.UUID
    device_id: str
    device_name: str | None
    last_active_at: datetime
    current: bool


@dataclass(frozen=True)
class AppLinks:
    """Links in emails open the app (app.json's scheme), which finishes the flow."""

    base: str

    def verify_email(self, token: str) -> str:
        return f"{self.base}auth/verify-email?token={token}"

    def reset_password(self, token: str) -> str:
        return f"{self.base}auth/reset-password?token={token}"


class _RotationRacedError(Exception):
    """Another request retired the same token first; the rotation is retried from the top."""


# --- the service ----------------------------------------------------------------------------------


class AuthService:
    def __init__(
        self,
        sessions: async_sessionmaker[AsyncSession],
        *,
        hasher: PasswordHasher,
        sender: EmailSender,
        limiter: RateLimiter,
        clock: Clock,
        jwt_secret: str,
        links: AppLinks,
    ) -> None:
        self._sessions = sessions
        self._hasher = hasher
        self._sender = sender
        self._limiter = limiter
        self._clock = clock
        self._jwt_secret = jwt_secret
        self._links = links

    # --- registration and sign-in -----------------------------------------------------------------

    async def register(self, registration: Registration, client: ClientContext) -> SignedIn:
        """Creates the account and signs its first device in. An address in use answers 409 (ADR-015
        §4)."""
        _check_new_password(registration.password)
        _check_privacy_key(registration.privacy_key)
        await self._limiter.check(
            REGISTER, ip=client.ip, account=normalise_account(registration.email)
        )
        password_hash = await self._hasher.hash(registration.password)
        now = self._clock()
        user_id = UserId(registration.user_id)
        verification = new_opaque_token()

        # The scope is the new account's own id before its row exists, so the insert passes WITH
        # CHECK (ADR-011).
        async with user_transaction(self._sessions, user_id) as session:
            user = User(
                id=user_id,
                email=registration.email,
                password_hash=password_hash,
                display_name=registration.display_name,
                unit_system=registration.unit_system,
                locale=registration.locale,
                timezone=registration.timezone,
                gamification_enabled=True,
                created_at=now,
                updated_at=now,
                sync_version=1,
            )
            _set_privacy_key(user, registration.privacy_key)
            try:
                await UserRepository(session).add(user_id, user)
            except IntegrityError as error:
                raise ConflictError(_conflict_code(error)) from None
            await self._new_verification_token(session, user_id, user.email, verification, now)
            tokens, _ = await self._open_device_session(
                session, user_id, registration.device_id, registration.device_name, now
            )
            account = _account_of(user)
            mail = [self._verification_email(user, user.email, verification)]

        await self._send(mail)
        return SignedIn(tokens, account)

    async def login(self, attempt: LoginAttempt, client: ClientContext) -> SignedIn:
        await self._limiter.check(LOGIN, ip=client.ip, account=normalise_account(attempt.email))
        async with transaction(self._sessions) as session:
            credentials = await unscoped.find_user_by_email(session, attempt.email)

        # The same work whether or not the account exists (04 §2).
        if credentials is None:
            await self._hasher.verify_absent_account(attempt.password)
            raise InvalidCredentialsError
        if not await self._hasher.verify(credentials.password_hash, attempt.password):
            raise InvalidCredentialsError
        rehashed = None
        if self._hasher.needs_rehash(credentials.password_hash):
            rehashed = await self._hasher.hash(attempt.password)

        user_id = credentials.user_id
        now = self._clock()
        async with user_transaction(self._sessions, user_id) as session:
            user = await _current_user(session, user_id)
            if rehashed is not None:
                user.password_hash = rehashed
            tokens_seen = RefreshTokenRepository(session)
            new_device = not await tokens_seen.device_has_signed_in(user_id, attempt.device_id)
            tokens, _ = await self._open_device_session(
                session, user_id, attempt.device_id, attempt.device_name, now
            )
            account = _account_of(user)
            mail = []
            if new_device:
                locale = _locale(user)
                device = attempt.device_name or message(locale, "email.new_device.unnamed_device")
                mail.append(
                    compose(
                        "new_device",
                        locale=locale,
                        to=user.email,
                        name=user.display_name,
                        device=device,
                    )
                )

        await self._send(mail)
        return SignedIn(tokens, account)

    async def refresh(self, refresh_token: str, client: ClientContext) -> Tokens:
        """Rotates a refresh token, with ADR-015's grace window for a response that never
        arrived."""
        await self._limiter.check(REFRESH, ip=client.ip)
        async with transaction(self._sessions) as session:
            found = await unscoped.find_refresh_token(session, hash_opaque_token(refresh_token))
        if found is None:
            raise RefreshRejectedError
        await self._limiter.check(REFRESH, account=str(found.user_id))

        for _attempt in range(2):
            try:
                outcome = await self._rotate(found.user_id, found.id)
            except _RotationRacedError:
                continue
            if isinstance(outcome, Tokens):
                return outcome
            if outcome is not None:
                await self._send([outcome])
            raise RefreshRejectedError
        raise RefreshRejectedError

    async def _rotate(self, user_id: UserId, token_id: uuid.UUID) -> Tokens | EmailMessage | None:
        """New tokens; or, when the token was reused, the notification to send once the revocation
        commits."""
        now = self._clock()
        async with user_transaction(self._sessions, user_id) as session:
            tokens = RefreshTokenRepository(session)
            presented = await tokens.get(user_id, token_id)
            if presented is None:
                return None
            successor = None
            if presented.replaced_by is not None:
                successor = await tokens.get(user_id, presented.replaced_by)
            decision = decide_rotation(
                _state(presented), None if successor is None else _state(successor), now
            )

            if decision == "reject":
                return None
            if decision == "reuse":
                await tokens.revoke_device(user_id, presented.device_id, now)
                user = await UserRepository(session).current(user_id)
                if user is None:
                    return None
                return compose(
                    "refresh_reuse", locale=_locale(user), to=user.email, name=user.display_name
                )

            retiring = presented if decision == "rotate" else successor
            if retiring is None:
                return None
            issued, successor_id = await self._open_device_session(
                session, user_id, presented.device_id, presented.device_name, now
            )
            if not await tokens.retire(user_id, retiring.id, successor_id=successor_id, now=now):
                raise _RotationRacedError
            return issued

    async def logout(self, principal: Principal) -> None:
        """Signs this device out. Every other device stays signed in."""
        async with user_transaction(self._sessions, principal.user_id) as session:
            await RefreshTokenRepository(session).revoke_device(
                principal.user_id, principal.device_id, self._clock()
            )

    async def logout_all(self, principal: Principal) -> None:
        async with user_transaction(self._sessions, principal.user_id) as session:
            await RefreshTokenRepository(session).revoke_all(principal.user_id, self._clock())

    # --- the account ------------------------------------------------------------------------------

    async def account(self, principal: Principal) -> Account:
        async with user_transaction(self._sessions, principal.user_id) as session:
            return _account_of(await _current_user(session, principal.user_id))

    async def update_account(self, principal: Principal, changes: Mapping[str, object]) -> Account:
        """Only the fields a user edits by hand; never a request model bound to the row (04 §5)."""
        if not set(changes) <= EDITABLE_ACCOUNT_FIELDS:
            raise InvalidRequestError("field_not_editable")
        now = self._clock()
        async with user_transaction(self._sessions, principal.user_id) as session:
            user = await _current_user(session, principal.user_id)
            for name, value in changes.items():
                setattr(user, name, value)
            UserRepository.touch(user, now)
            return _account_of(user)

    async def require_verified_email(self, principal: Principal) -> None:
        """The gate in front of what an unverified account may not do — never in front of training
        (04 §2a)."""
        async with user_transaction(self._sessions, principal.user_id) as session:
            verified = (await _current_user(session, principal.user_id)).email_verified_at
        if verified is None:
            raise EmailNotVerifiedError

    async def sessions(self, principal: Principal) -> list[DeviceSession]:
        now = self._clock()
        async with user_transaction(self._sessions, principal.user_id) as session:
            rows = await RefreshTokenRepository(session).active(principal.user_id, now)
        newest: dict[str, RefreshToken] = {}
        for row in rows:
            newest.setdefault(row.device_id, row)
        return [
            DeviceSession(
                id=row.id,
                device_id=row.device_id,
                device_name=row.device_name,
                last_active_at=row.issued_at,
                current=row.device_id == principal.device_id,
            )
            for row in newest.values()
        ]

    async def revoke_session(self, principal: Principal, session_id: uuid.UUID) -> None:
        now = self._clock()
        async with user_transaction(self._sessions, principal.user_id) as session:
            tokens = RefreshTokenRepository(session)
            row = await tokens.get(principal.user_id, session_id)
            if row is None or row.revoked_at is not None:
                raise NotFoundError
            await tokens.revoke_device(principal.user_id, row.device_id, now)

    # --- passwords --------------------------------------------------------------------------------

    async def change_password(
        self, principal: Principal, change: PasswordChange, client: ClientContext
    ) -> None:
        """Re-wraps the privacy key and keeps every device signed in (04 §2a)."""
        _check_new_password(change.new_password)
        _check_privacy_key(change.privacy_key)
        user_id = principal.user_id
        # Guessing the current password here counts against the same budget as guessing it at login.
        await self._limiter.check(LOGIN, ip=client.ip, account=str(user_id))
        async with user_transaction(self._sessions, user_id) as session:
            current_hash = (await _current_user(session, user_id)).password_hash
        if not await self._hasher.verify(current_hash, change.current_password):
            raise WrongPasswordError
        new_hash = await self._hasher.hash(change.new_password)

        now = self._clock()
        async with user_transaction(self._sessions, user_id) as session:
            user = await _current_user(session, user_id)
            user.password_hash = new_hash
            _set_privacy_key(user, change.privacy_key)
            UserRepository.touch(user, now)
            await PasswordResetTokenRepository(session).invalidate_unused(user_id, now)
            mail = [
                compose(
                    "password_changed", locale=_locale(user), to=user.email, name=user.display_name
                )
            ]
        await self._send(mail)

    async def request_password_reset(self, email: str, client: ClientContext) -> None:
        """Answers the caller identically whether or not the address has an account (04 §2a)."""
        await self._limiter.check(SENDS_EMAIL, ip=client.ip, account=normalise_account(email))
        async with transaction(self._sessions) as session:
            credentials = await unscoped.find_user_by_email(session, email)
        if credentials is None:
            return

        user_id = credentials.user_id
        token = new_opaque_token()
        now = self._clock()
        async with user_transaction(self._sessions, user_id) as session:
            user = await UserRepository(session).current(user_id)
            if user is None:
                return  # deleted since the lookup; the answer stays the same (04 §2a)
            await PasswordResetTokenRepository(session).add(
                user_id,
                PasswordResetToken(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    token_hash=hash_opaque_token(token),
                    expires_at=now + RESET_TOKEN_TTL,
                    used_at=None,
                    requested_ip=_inet(client.ip),
                    created_at=now,
                ),
            )
            mail = [
                compose(
                    "password_reset",
                    locale=_locale(user),
                    to=user.email,
                    name=user.display_name,
                    link=self._links.reset_password(token),
                )
            ]
        await self._send(mail)

    async def confirm_password_reset(self, reset: PasswordReset, client: ClientContext) -> None:
        """Signs every device out, and discards the privacy zones nothing can decrypt any more (04
        §2a)."""
        _check_new_password(reset.new_password)
        _check_privacy_key(reset.privacy_key)
        await self._limiter.check(DEFAULT, ip=client.ip)
        token_hash = hash_opaque_token(reset.token)
        async with transaction(self._sessions) as session:
            found = await unscoped.find_reset_token(session, token_hash)
        if found is None or found.used or found.expires_at <= self._clock():
            raise InvalidTokenError
        new_hash = await self._hasher.hash(reset.new_password)

        user_id = found.user_id
        now = self._clock()
        async with user_transaction(self._sessions, user_id) as session:
            resets = PasswordResetTokenRepository(session)
            if not await resets.redeem(user_id, token_hash, now):
                raise InvalidTokenError
            await resets.invalidate_unused(user_id, now)
            user = await _current_user(session, user_id)
            user.password_hash = new_hash
            _set_privacy_key(user, reset.privacy_key)
            UserRepository.touch(user, now)
            await PrivacyZoneRepository(session).discard_all(user_id, now)
            await RefreshTokenRepository(session).revoke_all(user_id, now)
            mail = [
                compose(
                    "password_changed", locale=_locale(user), to=user.email, name=user.display_name
                )
            ]
        await self._send(mail)

    # --- email addresses --------------------------------------------------------------------------

    async def verify_email(self, token: str, client: ClientContext) -> None:
        """Confirms an address: the account's own, or the one an email change asked for."""
        await self._limiter.check(DEFAULT, ip=client.ip)
        token_hash = hash_opaque_token(token)
        async with transaction(self._sessions) as session:
            found = await unscoped.find_verification_token(session, token_hash)
        if found is None or found.used or found.email is None or found.expires_at <= self._clock():
            raise InvalidTokenError

        user_id = found.user_id
        now = self._clock()
        mail: list[EmailMessage] = []
        async with user_transaction(self._sessions, user_id) as session:
            verifications = EmailVerificationTokenRepository(session)
            if not await verifications.redeem(user_id, token_hash, now):
                raise InvalidTokenError
            user = await _current_user(session, user_id)
            previous = user.email
            if previous.casefold() != found.email.casefold():
                user.email = found.email
                try:
                    await session.flush()
                except IntegrityError:
                    raise ConflictError("email_unavailable") from None
                # Any other outstanding link names an address that is no longer the account's.
                await verifications.invalidate_unused(user_id, now)
                mail.append(
                    compose(
                        "email_changed",
                        locale=_locale(user),
                        to=previous,
                        name=user.display_name,
                        new_email=found.email,
                    )
                )
            user.email_verified_at = now
            UserRepository.touch(user, now)
        await self._send(mail)

    async def resend_verification(self, principal: Principal, client: ClientContext) -> None:
        user_id = principal.user_id
        await self._limiter.check(SENDS_EMAIL, ip=client.ip, account=str(user_id))
        token = new_opaque_token()
        now = self._clock()
        async with user_transaction(self._sessions, user_id) as session:
            user = await _current_user(session, user_id)
            if user.email_verified_at is not None:
                return
            await self._new_verification_token(session, user_id, user.email, token, now)
            mail = [self._verification_email(user, user.email, token)]
        await self._send(mail)

    async def change_email(
        self, principal: Principal, current_password: str, new_email: str, client: ClientContext
    ) -> None:
        """Sends a confirmation link to the new address; nothing changes until it is opened (04
        §2a)."""
        user_id = principal.user_id
        await self._limiter.check(SENDS_EMAIL, ip=client.ip, account=str(user_id))
        async with user_transaction(self._sessions, user_id) as session:
            user = await _current_user(session, user_id)
            verified, current_email, current_hash = (
                user.email_verified_at is not None,
                user.email,
                user.password_hash,
            )
        if not verified:
            raise EmailNotVerifiedError
        if new_email.casefold() == current_email.casefold():
            raise InvalidRequestError("email_unchanged")
        if not await self._hasher.verify(current_hash, current_password):
            raise WrongPasswordError

        token = new_opaque_token()
        now = self._clock()
        async with user_transaction(self._sessions, user_id) as session:
            user = await _current_user(session, user_id)
            await self._new_verification_token(session, user_id, new_email, token, now)
            mail = [self._verification_email(user, new_email, token)]
        await self._send(mail)

    # --- helpers ----------------------------------------------------------------------------------

    async def _open_device_session(
        self,
        session: AsyncSession,
        user_id: UserId,
        device_id: str,
        device_name: str | None,
        now: datetime,
    ) -> tuple[Tokens, uuid.UUID]:
        refresh_token = new_opaque_token()
        row = RefreshToken(
            id=uuid.uuid4(),
            user_id=user_id,
            token_hash=hash_opaque_token(refresh_token),
            device_id=device_id,
            device_name=device_name,
            issued_at=now,
            expires_at=now + REFRESH_TOKEN_TTL,
            revoked_at=None,
            replaced_by=None,
        )
        await RefreshTokenRepository(session).add(user_id, row)
        access_token, access_expires_at = issue_access_token(
            self._jwt_secret, user_id=user_id, device_id=device_id, now=now
        )
        return Tokens(access_token, access_expires_at, refresh_token, row.expires_at), row.id

    @staticmethod
    async def _new_verification_token(
        session: AsyncSession, user_id: UserId, email: str, token: str, now: datetime
    ) -> None:
        await EmailVerificationTokenRepository(session).add(
            user_id,
            EmailVerificationToken(
                id=uuid.uuid4(),
                user_id=user_id,
                email=email,
                token_hash=hash_opaque_token(token),
                expires_at=now + VERIFICATION_TOKEN_TTL,
                used_at=None,
                created_at=now,
            ),
        )

    def _verification_email(self, user: User, to: str, token: str) -> EmailMessage:
        return compose(
            "verify_email",
            locale=_locale(user),
            to=to,
            name=user.display_name,
            link=self._links.verify_email(token),
        )

    async def _send(self, messages: Sequence[EmailMessage]) -> None:
        for item in messages:
            try:
                await self._sender.send(item)
            except Exception as error:  # a lost email never fails the flow that sent it
                _logger.error("email_not_sent", kind=item.kind, error=type(error).__name__)


async def _current_user(session: AsyncSession, user_id: UserId) -> User:
    """The account a flow acts for. Missing only if it was deleted since the flow found it (task
    019); a signed-in caller is then signed out, not told it does not exist."""
    user = await UserRepository(session).current(user_id)
    if user is None:
        raise UnauthenticatedError
    return user


def _account_of(user: User) -> Account:
    privacy_key = None
    if user.wrapped_privacy_key is not None and user.privacy_key_salt is not None:
        privacy_key = WrappedPrivacyKey(
            bytes(user.wrapped_privacy_key),
            bytes(user.privacy_key_salt),
            user.privacy_key_kdf or "",
        )
    return Account(
        id=user.id,
        email=user.email,
        email_verified=user.email_verified_at is not None,
        display_name=user.display_name,
        unit_system=user.unit_system,
        locale=user.locale,
        timezone=user.timezone,
        birth_date=user.birth_date,
        sex=user.sex,
        max_hr=user.max_hr,
        resting_hr=user.resting_hr,
        gamification_enabled=user.gamification_enabled,
        privacy_key=privacy_key,
        # Postgres returns a timestamp in the connection's time zone; the API answers in UTC.
        deletion_requested_at=None
        if user.deletion_requested_at is None
        else user.deletion_requested_at.astimezone(UTC),
    )


def _set_privacy_key(user: User, key: WrappedPrivacyKey) -> None:
    user.wrapped_privacy_key = key.wrapped_key
    user.privacy_key_salt = key.salt
    user.privacy_key_kdf = key.kdf


def _check_new_password(password: str) -> None:
    problem = password_problem(password)
    if problem is not None:
        raise PasswordRejectedError(problem)


def _check_privacy_key(key: WrappedPrivacyKey) -> None:
    if (
        len(key.wrapped_key) != WRAPPED_KEY_BYTES
        or len(key.salt) != KDF_SALT_BYTES
        or not wrapping_kdf_is_strong_enough(key.kdf)
    ):
        raise InvalidPrivacyKeyError


def _state(token: RefreshToken) -> TokenState:
    return TokenState(token.issued_at, token.expires_at, token.revoked_at, token.replaced_by)


def _locale(user: User) -> Locale:
    return "pt-BR" if user.locale == "pt-BR" else "en"


def _inet(ip: str | None) -> str | None:
    if ip is None:
        return None
    try:
        return str(ipaddress.ip_address(ip))
    except ValueError:
        return None


def _conflict_code(error: IntegrityError) -> str:
    constraint = getattr(getattr(error.orig, "diag", None), "constraint_name", None)
    return "email_unavailable" if constraint == "users_email_key" else "account_unavailable"
