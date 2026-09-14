"""Account deletion, requested and cancelled (task 019; 04 §2a, §7).

Two ways in. In the app, a signed-in user confirms with their password. On the web page Google Play
links to, anyone may ask for a confirmation link, which goes to the account's own address: the page
answers the same whether or not the address has an account (04 §2a), and nothing is scheduled until
the link's own page is confirmed.

Either way the account is deleted by the sweep in `app.services.maintenance.deletion`, seven days
after the request, unless the request is cancelled first. Other devices stay signed in until then,
so any of them can cancel. Nothing here asks for a verified email or an entitlement: deletion is a
privacy control, free at every tier (INV-26).

Email goes out after the transaction commits, and a failure to send never fails the request.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import Clock
from app.core.db import transaction, user_transaction
from app.core.email import EmailMessage, EmailSender, compose
from app.core.i18n import as_locale, format_day
from app.core.rate_limit import DEFAULT, LOGIN, SENDS_EMAIL, normalise_account
from app.core.scope import Principal, UserId
from app.core.security import PasswordHasher, hash_opaque_token, new_opaque_token
from app.models.identity import AccountDeletionToken, User
from app.repositories import unscoped
from app.repositories.account_tokens import AccountDeletionTokenRepository
from app.repositories.users import UserRepository
from app.services.auth.service import ClientContext
from app.services.errors import InvalidTokenError, UnauthenticatedError, WrongPasswordError
from app.services.rate_limit import RateLimiter

# The sweep deletes an account on its first run at least this long after the request. The
# function it looks accounts up with, maintenance_accounts_due_for_deletion, holds the same seven
# days in SQL; the sweep's tests hold the two together.
GRACE_PERIOD = timedelta(days=7)
DELETION_LINK_TTL = timedelta(minutes=30)

_logger = structlog.get_logger("app.auth.deletion")


@dataclass(frozen=True)
class ScheduledDeletion:
    requested_at: datetime
    deleted_from: datetime
    # `deleted_from` as a calendar date where the account lives (INV-17), for emails and pages.
    deleted_on: date


@dataclass(frozen=True)
class WebLinks:
    """Links in emails that open the API's own web pages, at its public address."""

    base: str

    def confirm_deletion(self, token: str) -> str:
        return f"{self.base.rstrip('/')}/account-deletion/confirm?token={token}"


class AccountDeletionService:
    def __init__(
        self,
        sessions: async_sessionmaker[AsyncSession],
        *,
        hasher: PasswordHasher,
        sender: EmailSender,
        limiter: RateLimiter,
        clock: Clock,
        links: WebLinks,
    ) -> None:
        self._sessions = sessions
        self._hasher = hasher
        self._sender = sender
        self._limiter = limiter
        self._clock = clock
        self._links = links

    # --- in the app -------------------------------------------------------------------------------

    async def request(
        self, principal: Principal, password: str, client: ClientContext
    ) -> ScheduledDeletion:
        """Needs the current password. Guessing it here counts against the same budget as guessing
        it at login, as a password change does (04 §5)."""
        user_id = principal.user_id
        await self._limiter.check(LOGIN, ip=client.ip, account=str(user_id))
        async with user_transaction(self._sessions, user_id) as session:
            password_hash = (await _signed_in_user(session, user_id)).password_hash
        if not await self._hasher.verify(password_hash, password):
            raise WrongPasswordError

        async with user_transaction(self._sessions, user_id) as session:
            scheduled, mail = self._schedule(await _signed_in_user(session, user_id))
        await self._send(mail)
        return scheduled

    async def cancel(self, principal: Principal) -> None:
        """Any signed-in device can cancel within the grace period; with nothing pending there is
        nothing to do."""
        mail: list[EmailMessage] = []
        async with user_transaction(self._sessions, principal.user_id) as session:
            user = await _signed_in_user(session, principal.user_id)
            if user.deletion_requested_at is not None:
                user.deletion_requested_at = None
                UserRepository.touch(user, self._clock())
                mail.append(
                    compose(
                        "deletion_cancelled",
                        locale=as_locale(user.locale),
                        to=user.email,
                        name=user.display_name,
                    )
                )
        await self._send(mail)

    # --- from the web page ------------------------------------------------------------------------

    async def request_link(self, email: str, client: ClientContext) -> None:
        """Sends a confirmation link to the account's address. The caller learns nothing either way
        (04 §2a)."""
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
                return
            await AccountDeletionTokenRepository(session).add(
                user_id,
                AccountDeletionToken(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    token_hash=hash_opaque_token(token),
                    expires_at=now + DELETION_LINK_TTL,
                    used_at=None,
                    created_at=now,
                ),
            )
            mail = [
                compose(
                    "deletion_link",
                    locale=as_locale(user.locale),
                    to=user.email,
                    name=user.display_name,
                    link=self._links.confirm_deletion(token),
                )
            ]
        await self._send(mail)

    async def confirm_link(self, token: str, client: ClientContext) -> ScheduledDeletion:
        """Schedules the deletion the link names. An unknown, used or expired link is refused, and
        which of them is not said."""
        await self._limiter.check(DEFAULT, ip=client.ip)
        token_hash = hash_opaque_token(token)
        async with transaction(self._sessions) as session:
            found = await unscoped.find_deletion_token(session, token_hash)
        if found is None or found.used or found.expires_at <= self._clock():
            raise InvalidTokenError

        async with user_transaction(self._sessions, found.user_id) as session:
            if not await AccountDeletionTokenRepository(session).redeem(
                found.user_id, token_hash, self._clock()
            ):
                raise InvalidTokenError
            user = await UserRepository(session).current(found.user_id)
            if user is None:
                raise InvalidTokenError
            scheduled, mail = self._schedule(user)
        await self._send(mail)
        return scheduled

    # --- helpers ----------------------------------------------------------------------------------

    def _schedule(self, user: User) -> tuple[ScheduledDeletion, list[EmailMessage]]:
        """Records the request. Asked again, it keeps the first date and sends nothing more."""
        if user.deletion_requested_at is not None:
            return _scheduled(user, user.deletion_requested_at), []
        now = self._clock()
        user.deletion_requested_at = now
        UserRepository.touch(user, now)
        scheduled = _scheduled(user, now)
        locale = as_locale(user.locale)
        mail = compose(
            "deletion_requested",
            locale=locale,
            to=user.email,
            name=user.display_name,
            date=format_day(locale, scheduled.deleted_on),
        )
        return scheduled, [mail]

    async def _send(self, messages: Sequence[EmailMessage]) -> None:
        for item in messages:
            try:
                await self._sender.send(item)
            except Exception as error:  # a lost email never fails the flow that sent it
                _logger.error("email_not_sent", kind=item.kind, error=type(error).__name__)


async def _signed_in_user(session: AsyncSession, user_id: UserId) -> User:
    """The account a valid access token names. It is missing only if it was deleted since the
    token was issued, and then the caller is signed out, not refused."""
    user = await UserRepository(session).current(user_id)
    if user is None:
        raise UnauthenticatedError
    return user


def _scheduled(user: User, requested_at: datetime) -> ScheduledDeletion:
    # Postgres returns a timestamp in the connection's time zone; the API always answers in UTC.
    requested_at = requested_at.astimezone(UTC)
    deleted_from = requested_at + GRACE_PERIOD
    return ScheduledDeletion(
        requested_at=requested_at,
        deleted_from=deleted_from,
        deleted_on=deleted_from.astimezone(_zone(user.timezone)).date(),
    )


def _zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")
