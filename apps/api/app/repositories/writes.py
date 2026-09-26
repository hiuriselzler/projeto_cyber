"""Transaction-level statements the aggregate writes need (task 004 stage 8). No business rules.

- **One user's writes run one at a time.** A workout write rebuilds that user's `personal_records`
  in the same transaction, and the rebuild deletes and re-inserts: two finishes at once would each
  delete, each insert, and the second would collide on the cache's unique indexes. A
  transaction-scoped advisory lock keyed on the user serialises them and releases itself at commit
  or rollback. Nobody else's writes wait.
- **Positions are checked at the end, not row by row.** `set_logs_position` and
  `routine_exercises_order` are `DEFERRABLE` but checked immediately by default, so a reorder sent
  as one document — set 2 becomes 3 while 3 becomes 2 — would fail halfway through. Deferring them
  and then asking for them immediately before the transaction ends surfaces a real clash inside the
  service, where it can be answered, rather than at commit.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scope import UserId

_POSITIONS = "set_logs_position, routine_exercises_order"


async def serialise_user_writes(session: AsyncSession, user_id: UserId) -> None:
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:user_id, 0))"),
        {"user_id": str(user_id)},
    )


async def defer_position_checks(session: AsyncSession) -> None:
    await session.execute(text(f"SET CONSTRAINTS {_POSITIONS} DEFERRED"))


async def check_positions_now(session: AsyncSession) -> None:
    """Flushes, then checks every deferred position: raises `IntegrityError` on a clash."""
    await session.flush()
    await session.execute(text(f"SET CONSTRAINTS {_POSITIONS} IMMEDIATE"))
