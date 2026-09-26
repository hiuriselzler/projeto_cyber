"""The mirror endpoints against real Postgres, as `cyberathlete_app` (task 004 stage 8, 02 §5).

What each `PUT` promises, proven row by row: a retry changes nothing, a stale copy loses, a newer
one wins, a row left out of the document survives, archiving is a `deleted_at` and never a delete
(02 §7, INV-11, INV-16); someone else's row is 404 to read and 409 to write, and a global answers a
write exactly as a stranger's row does (decision 3); a completed set without its mode's measure is
refused by the core's rule (decision 2); and the records cache follows a finished workout in the
same transaction (decision 4).
"""

import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import Engine, text

from tests.integration.api_support import (
    WRITTEN,
    Api,
    Device,
    entry_body,
    set_body,
    stamps,
    workout_body,
)

pytestmark = pytest.mark.integration

LATER = WRITTEN + timedelta(minutes=5)
EARLIER = WRITTEN - timedelta(minutes=5)


def a_global(migrator_engine: Engine, tracking: str = "weight_reps", *, nth: int = 0) -> str:
    with migrator_engine.connect() as connection:
        return str(
            connection.execute(
                text(
                    """SELECT id FROM exercises WHERE owner_user_id IS NULL AND tracking = :tracking
                         AND NOT uses_bodyweight
                       ORDER BY id LIMIT 1 OFFSET :nth"""
                ),
                {"tracking": tracking, "nth": nth},
            ).scalar_one()
        )


async def signed_in(api: Api) -> tuple[Device, uuid.UUID]:
    _, device, body = await api.register()
    return device, uuid.UUID(body["account"]["id"])


def exercise_body(
    name: str = "Supino do João", written: datetime = WRITTEN, **fields: Any
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": name,
        "modality": "barbell",
        "primary_muscle_id": 1,
        **stamps(written),
    }
    body.update(fields)
    return body


def records(migrator_engine: Engine, user_id: uuid.UUID) -> list[tuple[Any, ...]]:
    """Read as the migrator, so what row-level security would hide still counts."""
    with migrator_engine.connect() as connection:
        return [
            tuple(row)
            for row in connection.execute(
                text(
                    """SELECT exercise_id::text, kind::text, weight_kg, value, set_log_id::text
                       FROM personal_records WHERE user_id = :user_id
                       ORDER BY exercise_id, kind, weight_kg"""
                ),
                {"user_id": str(user_id)},
            )
        ]


# ── exercises ─────────────────────────────────────────────────────────────────────────────────────


async def test_an_exercise_is_created_once_and_then_resolves_by_updated_at(api_factory, seeded):
    api = await api_factory()
    device, _ = await signed_in(api)
    exercise_id = str(uuid.uuid4())

    created = await api.put(device, "exercises", exercise_id, exercise_body())
    again = await api.put(device, "exercises", exercise_id, exercise_body())
    stale = await api.put(device, "exercises", exercise_id, exercise_body("Old", written=EARLIER))
    newer = await api.put(device, "exercises", exercise_id, exercise_body("Supino", written=LATER))

    assert created.status_code == 201, created.text
    assert created.json()["name"] == "Supino do João"  # exactly as typed, never translated
    assert created.json()["is_own"] is True
    assert (again.status_code, again.json()) == (200, created.json())
    assert (stale.status_code, stale.json()["name"]) == (200, "Supino do João")
    assert (newer.status_code, newer.json()["name"]) == (200, "Supino")


async def test_a_global_answers_a_write_exactly_as_a_strangers_exercise_does(
    api_factory, seeded, migrator_engine
):
    api = await api_factory()
    device, _ = await signed_in(api)
    stranger, _ = await signed_in(api)
    theirs = str(uuid.uuid4())
    assert (await api.put(stranger, "exercises", theirs, exercise_body())).status_code == 201
    global_id = a_global(migrator_engine)

    to_global = await api.put(device, "exercises", global_id, exercise_body())
    to_theirs = await api.put(device, "exercises", theirs, exercise_body())

    assert (to_global.status_code, to_global.json()) == (409, {"error": "id_unavailable"})
    assert (to_theirs.status_code, to_theirs.json()) == (to_global.status_code, to_global.json())
    # Reading: a global is everyone's, a stranger's is not found (04 §4).
    read_global = await api.get(device, f"exercises/{global_id}")
    assert read_global.status_code == 200
    assert read_global.json()["is_own"] is False
    assert read_global.json()["name"] is None
    assert read_global.json()["name_key"].startswith("exercise.")
    read_theirs = await api.get(device, f"exercises/{theirs}")
    assert (read_theirs.status_code, read_theirs.json()) == (404, {"error": "not_found"})


async def test_a_fork_names_a_visible_exercise_and_never_someone_elses(
    api_factory, seeded, migrator_engine
):
    api = await api_factory()
    device, _ = await signed_in(api)
    stranger, _ = await signed_in(api)
    theirs = str(uuid.uuid4())
    await api.put(stranger, "exercises", theirs, exercise_body())

    fork = await api.put(
        device,
        "exercises",
        str(uuid.uuid4()),
        exercise_body("Supino reto", forked_from_id=a_global(migrator_engine)),
    )
    leak = await api.put(
        device, "exercises", str(uuid.uuid4()), exercise_body("Copy", forked_from_id=theirs)
    )

    assert fork.status_code == 201, fork.text
    assert (leak.status_code, leak.json()) == (422, {"error": "reference_unknown"})


async def test_a_name_already_live_is_an_error_on_the_name_never_a_suffix(api_factory, seeded):
    api = await api_factory()
    device, _ = await signed_in(api)
    await api.put(device, "exercises", str(uuid.uuid4()), exercise_body("Remada"))

    clash = await api.put(device, "exercises", str(uuid.uuid4()), exercise_body("remada"))

    assert (clash.status_code, clash.json()) == (422, {"error": "name_taken"})


async def test_secondary_muscles_travel_with_their_exercise(api_factory, seeded):
    api = await api_factory()
    device, _ = await signed_in(api)
    exercise_id = str(uuid.uuid4())

    first = await api.put(
        device, "exercises", exercise_id, exercise_body(secondary_muscle_ids=[9, 3])
    )
    # The primary moved to a muscle that was secondary: both triggers are in play (FR-2.16).
    swapped = await api.put(
        device,
        "exercises",
        exercise_id,
        exercise_body(primary_muscle_id=9, secondary_muscle_ids=[1], written=LATER),
    )
    primary_twice = await api.put(
        device, "exercises", str(uuid.uuid4()), exercise_body("X", secondary_muscle_ids=[1])
    )
    unknown = await api.put(
        device, "exercises", str(uuid.uuid4()), exercise_body("Y", secondary_muscle_ids=[999])
    )

    assert first.json()["secondary_muscle_ids"] == [3, 9]
    assert swapped.status_code == 200, swapped.text
    assert (swapped.json()["primary_muscle_id"], swapped.json()["secondary_muscle_ids"]) == (9, [1])
    assert primary_twice.status_code == 422
    assert (unknown.status_code, unknown.json()) == (422, {"error": "reference_unknown"})


async def test_the_list_is_the_catalog_and_the_users_own_a_page_at_a_time(api_factory, seeded):
    api = await api_factory()
    device, _ = await signed_in(api)
    stranger, _ = await signed_in(api)
    mine, archived, theirs = (str(uuid.uuid4()) for _ in range(3))
    await api.put(device, "exercises", mine, exercise_body("Mine"))
    await api.put(
        device, "exercises", archived, exercise_body("Put away", deleted_at=WRITTEN.isoformat())
    )
    await api.put(stranger, "exercises", theirs, exercise_body("Theirs"))

    seen: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        params: dict[str, Any] = {"limit": 50}
        if cursor is not None:
            params["after"] = cursor
        page = await api.get(device, "exercises", **params)
        assert page.status_code == 200, page.text
        seen.extend(page.json()["items"])
        cursor = page.json()["next"]
        if cursor is None:
            break
    ids = [item["id"] for item in seen]
    with_archived = await api.get(device, "exercises", limit=500, include_archived=True)

    assert len(ids) == len(set(ids)) > 200  # 201 seeded globals, and nothing twice across pages
    assert mine in ids
    assert archived not in ids  # archiving is `deleted_at` (INV-11), and the default list is live
    assert theirs not in ids
    assert archived in {item["id"] for item in with_archived.json()["items"]}
    bad = await api.get(device, "exercises", after="not-a-cursor")
    assert (bad.status_code, bad.json()) == (400, {"error": "invalid_cursor"})


# ── routines ──────────────────────────────────────────────────────────────────────────────────────


def routine_body(
    entries: list[dict[str, Any]], written: datetime = WRITTEN, **fields: Any
) -> dict[str, Any]:
    body: dict[str, Any] = {"name": "Treino A", "exercises": entries, **stamps(written)}
    body.update(fields)
    return body


def routine_entry(
    exercise_id: str, order: int, written: datetime = WRITTEN, **fields: Any
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "exercise_id": exercise_id,
        "order_index": order,
        "target_sets": 3,
        "target_min_reps": 6,
        "target_max_reps": 8,
        "rest_seconds": 120,
        **stamps(written),
    }
    body.update(fields)
    return body


async def test_a_routine_reorders_in_one_document_and_keeps_what_it_leaves_out(
    api_factory, seeded, migrator_engine
):
    api = await api_factory()
    device, _ = await signed_in(api)
    routine_id = str(uuid.uuid4())
    bench, row = a_global(migrator_engine), a_global(migrator_engine, "reps_only")
    first, second = routine_entry(bench, 0), routine_entry(row, 1)

    created = await api.put(device, "routines", routine_id, routine_body([first, second]))
    # Swap the two positions in one write: the unique order is checked at the end, not per row.
    swapped = await api.put(
        device,
        "routines",
        routine_id,
        routine_body(
            [
                {**first, "order_index": 1, **stamps(LATER)},
                {**second, "order_index": 0, **stamps(LATER)},
            ]
        ),
    )
    # A document naming only the routine leaves both entries where they are (02 §7).
    renamed = await api.put(device, "routines", routine_id, routine_body([], LATER, name="B"))

    assert created.status_code == 201, created.text
    assert swapped.status_code == 200, swapped.text
    assert [entry["id"] for entry in swapped.json()["exercises"]] == [second["id"], first["id"]]
    assert renamed.json()["name"] == "B"
    assert len(renamed.json()["exercises"]) == 2


async def test_a_routine_refuses_a_strangers_exercise_and_a_borrowed_entry(
    api_factory, seeded, migrator_engine
):
    api = await api_factory()
    device, _ = await signed_in(api)
    stranger, _ = await signed_in(api)
    theirs = str(uuid.uuid4())
    await api.put(stranger, "exercises", theirs, exercise_body())
    bench = a_global(migrator_engine)
    entry = routine_entry(bench, 0)
    await api.put(device, "routines", str(uuid.uuid4()), routine_body([entry]))

    strangers = await api.put(
        device, "routines", str(uuid.uuid4()), routine_body([routine_entry(theirs, 0)])
    )
    borrowed = await api.put(device, "routines", str(uuid.uuid4()), routine_body([entry]))
    taken = await api.put(stranger, "routines", str(uuid.uuid4()), routine_body([entry]))

    assert (strangers.status_code, strangers.json()) == (422, {"error": "reference_unknown"})
    assert (borrowed.status_code, borrowed.json()) == (409, {"error": "parent_mismatch"})
    assert (taken.status_code, taken.json()) == (409, {"error": "id_unavailable"})


# ── workouts ──────────────────────────────────────────────────────────────────────────────────────


async def test_a_workout_document_round_trips_and_a_retry_changes_nothing(
    api_factory, seeded, migrator_engine
):
    api = await api_factory()
    device, _ = await signed_in(api)
    workout_id = str(uuid.uuid4())
    warmup = set_body(1, set_type="warmup", weight_kg=60.0, rir=None)
    working = set_body(2, weight_kg=45.359237)  # 100 lb, kept to the column's four places
    body = workout_body([entry_body(a_global(migrator_engine), [warmup, working])], ended=True)

    created = await api.put(device, "workouts", workout_id, body)
    again = await api.put(device, "workouts", workout_id, body)
    read = await api.get(device, f"workouts/{workout_id}")

    assert created.status_code == 201, created.text
    assert (again.status_code, again.json()) == (200, created.json())
    assert read.json() == created.json()
    sets = read.json()["exercises"][0]["sets"]
    assert [one["set_type"] for one in sets] == ["warmup", "working"]
    assert sets[0]["rir"] is None  # INV-03: not recorded stays absent, never 0
    assert sets[1]["weight_kg"] == 45.3592
    assert round(sets[1]["weight_kg"] / 0.45359237, 2) == 100.0  # still 100 lb on the way back


async def test_each_set_resolves_by_itself_and_none_is_dropped(
    api_factory, seeded, migrator_engine
):
    api = await api_factory()
    device, _ = await signed_in(api)
    workout_id = str(uuid.uuid4())
    one, two, three = set_body(1), set_body(2), set_body(3)
    entry = entry_body(a_global(migrator_engine), [one, two, three])
    await api.put(device, "workouts", workout_id, workout_body([entry]))

    later = await api.put(
        device,
        "workouts",
        workout_id,
        workout_body(
            [
                {
                    **entry,
                    "sets": [
                        {**one, "reps": 6, **stamps(LATER)},  # newer: wins
                        {**two, "reps": 1, **stamps(EARLIER)},  # older: loses
                        # set three is not in the document at all: it survives (02 §7)
                    ],
                }
            ]
        ),
    )
    archived = await api.put(
        device,
        "workouts",
        workout_id,
        workout_body(
            [{**entry, "sets": [{**three, **stamps(LATER, deleted=LATER)}]}], written=EARLIER
        ),
    )

    assert later.status_code == 200, later.text
    reps = {one_set["id"]: one_set["reps"] for one_set in later.json()["exercises"][0]["sets"]}
    assert reps == {one["id"]: 6, two["id"]: 5, three["id"]: 5}
    kept = {s["id"]: s["deleted_at"] for s in archived.json()["exercises"][0]["sets"]}
    assert kept[three["id"]] is not None  # archived, still there (INV-11)
    assert len(kept) == 3


async def test_sets_swap_places_in_one_document(api_factory, seeded, migrator_engine):
    api = await api_factory()
    device, _ = await signed_in(api)
    workout_id = str(uuid.uuid4())
    one, two = set_body(1, weight_kg=60.0), set_body(2, weight_kg=80.0)
    entry = entry_body(a_global(migrator_engine), [one, two])
    await api.put(device, "workouts", workout_id, workout_body([entry]))

    swapped = await api.put(
        device,
        "workouts",
        workout_id,
        workout_body(
            [
                {
                    **entry,
                    "sets": [
                        {**one, "set_index": 2, **stamps(LATER)},
                        {**two, "set_index": 1, **stamps(LATER)},
                    ],
                }
            ]
        ),
    )
    clash = await api.put(
        device,
        "workouts",
        workout_id,
        workout_body([{**entry, "sets": [set_body(1, LATER)]}]),
    )

    assert swapped.status_code == 200, swapped.text
    assert [s["weight_kg"] for s in swapped.json()["exercises"][0]["sets"]] == [80.0, 60.0]
    assert (clash.status_code, clash.json()) == (409, {"error": "position_taken"})


@pytest.mark.parametrize(
    ("tracking", "fields", "missing"),
    [
        ("weight_reps", {"reps": None}, "reps"),
        ("duration", {"weight_kg": None, "reps": None, "rir": None}, "duration_s"),
        ("distance_duration", {"reps": None, "rir": None, "duration_s": 40}, "distance_m"),
    ],
)
async def test_a_completed_set_needs_its_modes_measure(
    api_factory, seeded, migrator_engine, tracking, fields, missing
):
    api = await api_factory()
    device, _ = await signed_in(api)
    exercise = a_global(migrator_engine, tracking)

    refused = await api.put(
        device,
        "workouts",
        str(uuid.uuid4()),
        workout_body([entry_body(exercise, [set_body(1, **fields)])]),
    )
    unticked = await api.put(
        device,
        "workouts",
        str(uuid.uuid4()),
        workout_body([entry_body(exercise, [set_body(1, is_completed=False, **fields)])]),
    )

    assert (refused.status_code, refused.json()) == (422, {"error": f"set_missing_{missing}"})
    assert unticked.status_code == 201, unticked.text  # a pre-filled row may be empty


async def test_someone_elses_workout_is_404_to_read_and_409_to_write(
    api_factory, seeded, migrator_engine
):
    api = await api_factory()
    owner, _ = await signed_in(api)
    stranger, _ = await signed_in(api)
    workout_id = str(uuid.uuid4())
    one = set_body(1)
    entry = entry_body(a_global(migrator_engine), [one])
    await api.put(owner, "workouts", workout_id, workout_body([entry]))

    read = await api.get(stranger, f"workouts/{workout_id}")
    write = await api.put(stranger, "workouts", workout_id, workout_body())
    # Their set's id inside a workout of the stranger's own: the same answer, and nothing said.
    child = await api.put(
        stranger, "workouts", str(uuid.uuid4()), workout_body([{**entry, "id": str(uuid.uuid4())}])
    )

    assert (read.status_code, read.json()) == (404, {"error": "not_found"})
    assert (write.status_code, write.json()) == (409, {"error": "id_unavailable"})
    assert (child.status_code, child.json()) == (409, {"error": "id_unavailable"})


async def test_the_list_is_newest_first_and_pages_without_repeats(api_factory, seeded):
    api = await api_factory()
    device, _ = await signed_in(api)
    stranger, _ = await signed_in(api)
    ids = []
    for hours in range(5):
        workout_id = str(uuid.uuid4())
        started = (WRITTEN - timedelta(hours=hours)).isoformat()
        await api.put(device, "workouts", workout_id, workout_body(started_at=started))
        ids.append(workout_id)
    await api.log_workout(stranger)

    first = await api.get(device, "workouts", limit=3)
    second = await api.get(device, "workouts", limit=3, before=first.json()["next"])

    listed = [item["id"] for item in first.json()["items"] + second.json()["items"]]
    assert listed == ids  # newest start first, the stranger's nowhere
    assert second.json()["next"] is None
    assert "exercises" not in first.json()["items"][0]


# ── the records cache, rebuilt in the same transaction (decision 4) ──────────────────────────────


async def test_finishing_a_workout_writes_its_records_and_an_edit_moves_them(
    api_factory, seeded, migrator_engine
):
    api = await api_factory()
    device, user_id = await signed_in(api)
    bench = a_global(migrator_engine)
    workout_id = str(uuid.uuid4())
    top = set_body(1, weight_kg=100.0, reps=5, rir=2)
    entry = entry_body(bench, [top])

    await api.put(device, "workouts", workout_id, workout_body([entry]))
    assert records(migrator_engine, user_id) == []  # an open workout sets no record

    await api.put(device, "workouts", workout_id, workout_body([entry], ended=True, written=LATER))
    finished = {(kind, value) for _, kind, _, value, _ in records(migrator_engine, user_id)}
    assert ("max_weight", 100) in finished
    assert ("best_session_volume", 500) in finished

    heavier = {**top, "weight_kg": 110.0, **stamps(LATER + timedelta(minutes=1))}
    await api.put(
        device,
        "workouts",
        workout_id,
        workout_body([{**entry, "sets": [heavier]}], ended=True, written=LATER),
    )
    edited = {(kind, value) for _, kind, _, value, _ in records(migrator_engine, user_id)}
    assert ("max_weight", 110) in edited
    assert ("max_weight", 100) not in edited


async def test_a_rebuild_touches_only_the_exercises_the_write_held(
    api_factory, seeded, migrator_engine
):
    api = await api_factory()
    device, user_id = await signed_in(api)
    bench, other = a_global(migrator_engine), a_global(migrator_engine, nth=1)
    await api.put(
        device,
        "workouts",
        str(uuid.uuid4()),
        workout_body([entry_body(other, [set_body(1, weight_kg=40.0)])], ended=True),
    )
    before = [row for row in records(migrator_engine, user_id) if row[0] == other]

    await api.put(
        device,
        "workouts",
        str(uuid.uuid4()),
        workout_body([entry_body(bench, [set_body(1)])], ended=True),
    )

    assert before
    assert [row for row in records(migrator_engine, user_id) if row[0] == other] == before


async def test_two_finishes_at_once_do_not_collide_on_the_cache(
    api_factory, seeded, migrator_engine
):
    api = await api_factory()
    device, user_id = await signed_in(api)
    bench = a_global(migrator_engine)

    results = await asyncio.gather(
        *(
            api.put(
                device,
                "workouts",
                str(uuid.uuid4()),
                workout_body([entry_body(bench, [set_body(1, weight_kg=weight)])], ended=True),
            )
            for weight in (80.0, 90.0, 100.0)
        )
    )

    assert [result.status_code for result in results] == [201, 201, 201]
    kinds = [(kind, value) for _, kind, _, value, _ in records(migrator_engine, user_id)]
    assert ("max_weight", 100) in kinds
    assert len([kind for kind, _ in kinds if kind == "max_weight"]) == 1
