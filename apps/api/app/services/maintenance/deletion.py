"""The account-deletion sweep (task 019; 04 §7; ADR-011, ADR-013).

Finds the accounts whose deletion was requested at least seven days ago, through the one function
allowed to look across users, then deletes each inside its own scope and its own transaction by
deleting its `users` row; the cascade removes every row the account owns (03 §10). It is the one
real delete in the product — INV-11's exception.

The "account deleted" email goes out only once that transaction has committed, to the address the
delete itself returned, so nobody is told of a deletion that did not happen.
"""

import structlog
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import Clock
from app.core.db import transaction, user_transaction
from app.core.email import EmailSender, compose
from app.core.i18n import as_locale
from app.repositories import unscoped
from app.repositories.users import DeletedAccount, UserRepository
from app.services.auth.deletion import GRACE_PERIOD

_logger = structlog.get_logger("app.maintenance.deletion")


class AccountDeletionSweep:
    def __init__(
        self, sessions: async_sessionmaker[AsyncSession], *, sender: EmailSender, clock: Clock
    ) -> None:
        self._sessions = sessions
        self._sender = sender
        self._clock = clock

    async def run(self) -> int:
        """Deletes every account that is due, and returns how many. Safe to run at any time, as
        often as wanted: a second run finds nothing."""
        now = self._clock()
        async with transaction(self._sessions) as session:
            due = await unscoped.accounts_due_for_deletion(session, now)

        deleted = 0
        for user_id in due:
            try:
                async with user_transaction(self._sessions, user_id) as session:
                    gone = await UserRepository(session).delete_if_requested_before(
                        user_id, now - GRACE_PERIOD
                    )
            except SQLAlchemyError as error:
                # One account that will not delete must not hold up the others. Logged by id, never
                # by address (04 §9).
                _logger.error(
                    "account_not_deleted", user_id=str(user_id), error=type(error).__name__
                )
                continue
            if gone is None:
                continue  # the deletion was cancelled after the lookup found it
            deleted += 1
            await self._tell(gone)
        return deleted

    async def _tell(self, account: DeletedAccount) -> None:
        message = compose(
            "account_deleted",
            locale=as_locale(account.locale),
            to=account.email,
            name=account.display_name,
        )
        try:
            await self._sender.send(message)
        except Exception as error:  # a lost email never fails the sweep
            _logger.error("email_not_sent", kind=message.kind, error=type(error).__name__)
