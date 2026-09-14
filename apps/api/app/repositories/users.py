"""The account row itself. Its owner column is `id` (ADR-011)."""

from app.core.scope import UserId
from app.models.identity import User
from app.repositories.base import ScopedRepository


class UserRepository(ScopedRepository[User]):
    model = User
    owner_column = "id"

    async def current(self, user_id: UserId) -> User | None:
        return await self.get(user_id, user_id)
