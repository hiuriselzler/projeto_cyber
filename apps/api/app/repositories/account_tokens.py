"""Single-use tokens sent by email: password reset (30 minutes), email verification (24 hours) —
04 §2a — and the web deletion page's confirmation link (30 minutes, task 019)."""

from datetime import datetime

from sqlalchemy import update

from app.core.scope import UserId
from app.models.identity import AccountDeletionToken, EmailVerificationToken, PasswordResetToken
from app.repositories.base import ScopedRepository


class PasswordResetTokenRepository(ScopedRepository[PasswordResetToken]):
    model = PasswordResetToken

    async def redeem(self, user_id: UserId, token_hash: str, now: datetime) -> bool:
        """Marks the token used if it is still unused and unexpired. False if it was not — or was
        just taken."""
        statement = (
            update(PasswordResetToken)
            .where(
                PasswordResetToken.user_id == user_id,
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > now,
            )
            .values(used_at=now)
            .returning(PasswordResetToken.id)
            .execution_options(synchronize_session=False)
        )
        return len((await self._session.execute(statement)).all()) == 1

    async def invalidate_unused(self, user_id: UserId, now: datetime) -> int:
        """On any password change, every outstanding reset link stops working (04 §2a)."""
        statement = (
            update(PasswordResetToken)
            .where(PasswordResetToken.user_id == user_id, PasswordResetToken.used_at.is_(None))
            .values(used_at=now)
            .returning(PasswordResetToken.id)
            .execution_options(synchronize_session=False)
        )
        return len((await self._session.execute(statement)).all())


class EmailVerificationTokenRepository(ScopedRepository[EmailVerificationToken]):
    model = EmailVerificationToken

    async def redeem(self, user_id: UserId, token_hash: str, now: datetime) -> bool:
        statement = (
            update(EmailVerificationToken)
            .where(
                EmailVerificationToken.user_id == user_id,
                EmailVerificationToken.token_hash == token_hash,
                EmailVerificationToken.used_at.is_(None),
                EmailVerificationToken.expires_at > now,
            )
            .values(used_at=now)
            .returning(EmailVerificationToken.id)
            .execution_options(synchronize_session=False)
        )
        return len((await self._session.execute(statement)).all()) == 1

    async def invalidate_unused(self, user_id: UserId, now: datetime) -> int:
        """Once an address changes, every other outstanding link names one that is no longer the
        account's."""
        statement = (
            update(EmailVerificationToken)
            .where(
                EmailVerificationToken.user_id == user_id, EmailVerificationToken.used_at.is_(None)
            )
            .values(used_at=now)
            .returning(EmailVerificationToken.id)
            .execution_options(synchronize_session=False)
        )
        return len((await self._session.execute(statement)).all())


class AccountDeletionTokenRepository(ScopedRepository[AccountDeletionToken]):
    model = AccountDeletionToken

    async def redeem(self, user_id: UserId, token_hash: str, now: datetime) -> bool:
        """Marks the link used if it is still unused and unexpired. False if it was not — or was
        just taken."""
        statement = (
            update(AccountDeletionToken)
            .where(
                AccountDeletionToken.user_id == user_id,
                AccountDeletionToken.token_hash == token_hash,
                AccountDeletionToken.used_at.is_(None),
                AccountDeletionToken.expires_at > now,
            )
            .values(used_at=now)
            .returning(AccountDeletionToken.id)
            .execution_options(synchronize_session=False)
        )
        return len((await self._session.execute(statement)).all()) == 1
