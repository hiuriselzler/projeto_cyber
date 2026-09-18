"""The account row itself. Its owner column is `id` (ADR-011)."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete

from app.core.scope import UserId
from app.models.identity import User
from app.repositories.base import ScopedRepository


@dataclass(frozen=True)
class DeletedAccount:
    """Who to tell that their account is gone — returned by the statement that deleted it."""

    email: str
    display_name: str
    locale: str


class UserRepository(ScopedRepository[User]):
    model = User
    owner_column = "id"

    async def current(self, user_id: UserId) -> User | None:
        return await self.get(user_id, user_id)

    async def delete_if_requested_before(
        self, user_id: UserId, cutoff: datetime
    ) -> DeletedAccount | None:
        """Deletes the account, and by cascade every row it owns (03 §10, INV-11's exception) — but
        only if its deletion was requested at or before `cutoff`.

        The condition sits in the delete itself, so a deletion cancelled after the sweep found the
        account is not carried out. None when nothing was deleted.
        """
        statement = (
            delete(User)
            .where(User.id == user_id, User.deletion_requested_at <= cutoff)
            .returning(User.email, User.display_name, User.locale)
            .execution_options(synchronize_session=False)
        )
        row = (await self._session.execute(statement)).one_or_none()
        if row is None:
            return None
        return DeletedAccount(email=row.email, display_name=row.display_name, locale=row.locale)
