"""Every row is owned and every query is scoped — twice (INV-15, NFR-9, ADR-011)."""

import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import get_session_factory, transaction, user_transaction
from app.core.scope import UserId
from app.models.strength import Workout
from app.repositories.workouts import WorkoutRepository
from tests.integration.api_support import API, bearer

pytestmark = pytest.mark.integration


class ForgetfulWorkoutRepository(WorkoutRepository):
    """The first line of defence, deliberately removed: these queries never mention an owner."""

    async def by_id_for_anyone(self, workout_id: uuid.UUID) -> Workout | None:
        statement = select(Workout).where(Workout.id == workout_id)
        return (await self._session.execute(statement)).scalar_one_or_none()

    async def everything(self) -> list[Workout]:
        return list((await self._session.scalars(select(Workout))).all())


async def test_another_users_workout_is_not_found(api_factory):
    api = await api_factory()
    _, owner, _ = await api.register()
    _, stranger, _ = await api.register()
    created = await api.log_workout(owner)
    workout_id = created.json()["id"]

    own = await api.client.get(f"{API}/workouts/{workout_id}", headers=bearer(owner.access_token))
    theirs = await api.client.get(
        f"{API}/workouts/{workout_id}", headers=bearer(stranger.access_token)
    )
    absent = await api.client.get(
        f"{API}/workouts/{uuid.uuid4()}", headers=bearer(stranger.access_token)
    )

    assert own.status_code == 200
    assert (theirs.status_code, theirs.json()) == (404, {"error": "not_found"})
    assert (absent.status_code, absent.json()) == (theirs.status_code, theirs.json())


async def test_a_client_may_choose_an_id_but_never_an_owner(api_factory):
    """INV-16: re-sending is harmless, and someone else's id is a conflict that says nothing
    more."""
    api = await api_factory()
    _, owner, _ = await api.register()
    _, stranger, _ = await api.register()
    workout_id = str(uuid.uuid4())

    assert (await api.log_workout(owner, workout_id)).status_code == 201
    assert (await api.log_workout(owner, workout_id)).status_code == 200
    taken = await api.log_workout(stranger, workout_id)

    assert (taken.status_code, taken.json()) == (409, {"error": "id_unavailable"})


async def test_with_rls_a_query_that_forgets_its_owner_returns_nothing_of_anyone_elses(
    api_factory, migrator_engine
):
    """The second line of defence, proven with the first deliberately broken (NFR-9)."""
    api = await api_factory()
    _, owner, owner_body = await api.register()
    _, stranger, _ = await api.register()
    owners_workout = uuid.UUID((await api.log_workout(owner)).json()["id"])
    strangers_workout = uuid.UUID((await api.log_workout(stranger)).json()["id"])
    owner_id = UserId(uuid.UUID(owner_body["account"]["id"]))
    with migrator_engine.connect() as connection:
        both = connection.execute(
            text("SELECT count(*) FROM workouts WHERE id IN (:a, :b)"),
            {"a": owners_workout, "b": strangers_workout},
        ).scalar_one()
    assert both == 2  # the rows exist; only the app role cannot see them

    sessions = get_session_factory()
    async with user_transaction(sessions, owner_id) as session:
        forgetful = ForgetfulWorkoutRepository(session)
        assert await forgetful.by_id_for_anyone(strangers_workout) is None
        assert {workout.id for workout in await forgetful.everything()} == {owners_workout}

    async with transaction(sessions) as session:
        assert await ForgetfulWorkoutRepository(session).everything() == []


async def test_the_user_scope_ends_with_its_transaction_on_a_reused_connection(migrated):
    """`SET LOCAL`, not `SET`: one pooled connection must not carry a user into the next request."""
    engine = create_async_engine(
        migrated.app, pool_size=1, max_overflow=0, connect_args={"prepare_threshold": None}
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with user_transaction(sessions, UserId(uuid.uuid4())) as session:
            first_backend = (await session.execute(text("SELECT pg_backend_pid()"))).scalar_one()
            scope = text("SELECT current_setting('app.user_id', true)")
            assert (await session.execute(scope)).scalar_one()

        async with transaction(sessions) as session:
            same_backend = (await session.execute(text("SELECT pg_backend_pid()"))).scalar_one()
            leftover = (await session.execute(scope)).scalar_one()
    finally:
        await engine.dispose()

    assert same_backend == first_backend
    assert leftover in (None, "")
