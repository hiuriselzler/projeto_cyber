"""/api/v1/workouts — a workout with its exercise entries and sets (task 004 stage 8, 02 §5).

Task 003's `POST /workouts` is retired for the `PUT` below: one write route per resource, and the
mobile app never called it. Its two proofs — ownership, and a deleted account's `401` — run against
the `PUT` now.
"""

import uuid

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import CurrentUser, Workouts, default_rate_limit
from app.api.v1.paging import Limit, before_cursor, read_before
from app.schemas.common import ErrorResponse
from app.schemas.workouts import (
    SetDocument,
    WorkoutDocument,
    WorkoutExerciseDocument,
    WorkoutPage,
    WorkoutResponse,
    WorkoutSummary,
)
from app.services.upserts import Stamps
from app.services.workouts import SetDoc, WorkoutDoc, WorkoutExerciseDoc

router = APIRouter(
    prefix="/workouts", tags=["workouts"], dependencies=[Depends(default_rate_limit)]
)


@router.get("", responses={400: {"model": ErrorResponse}})
async def list_workouts(
    principal: CurrentUser,
    service: Workouts,
    before: str | None = None,
    limit: Limit = 50,
    include_archived: bool = False,
) -> WorkoutPage:
    """The user's workouts, without their exercises, newest start first, a page at a time."""
    page = await service.list(
        principal, before=read_before(before), limit=limit, include_archived=include_archived
    )
    return WorkoutPage(
        items=[_summary(item) for item in page.items], next=before_cursor(page.next_before)
    )


@router.get("/{workout_id}", responses={404: {"model": ErrorResponse}})
async def get_workout(
    workout_id: uuid.UUID, principal: CurrentUser, service: Workouts
) -> WorkoutResponse:
    """The workout, every exercise entry and every set, archived ones included. 404 for a workout
    that does not exist and for one that is somebody else's alike (04 §4)."""
    return _response(await service.get(principal, workout_id))


@router.put(
    "/{workout_id}",
    responses={
        201: {"model": WorkoutResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
async def put_workout(
    workout_id: uuid.UUID,
    body: WorkoutDocument,
    principal: CurrentUser,
    service: Workouts,
    response: Response,
) -> WorkoutResponse:
    """Applies the document row by row — each row's newer `updated_at` wins, a row left out is
    kept — and answers with the workout as stored (decision 1). Idempotent by the client's ids
    (INV-16): resending changes nothing. A completed set without its mode's measure is
    `422 set_missing_<field>` (decision 2)."""
    stored, created = await service.put(principal, _doc(workout_id, body))
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return _response(stored)


def _stamps(body: WorkoutDocument | WorkoutExerciseDocument | SetDocument) -> Stamps:
    return Stamps(body.created_at, body.updated_at, body.deleted_at)


def _doc(workout_id: uuid.UUID, body: WorkoutDocument) -> WorkoutDoc:
    return WorkoutDoc(
        id=workout_id,
        routine_id=body.routine_id,
        planned_session_id=body.planned_session_id,
        title=body.title,
        started_at=body.started_at,
        ended_at=body.ended_at,
        local_date=body.local_date,
        tz=body.tz,
        notes=body.notes,
        perceived_fatigue=body.perceived_fatigue,
        source=body.source,
        stamps=_stamps(body),
        exercises=tuple(
            WorkoutExerciseDoc(
                id=entry.id,
                exercise_id=entry.exercise_id,
                order_index=entry.order_index,
                superset_group=entry.superset_group,
                notes=entry.notes,
                planned_exercise_id=entry.planned_exercise_id,
                rest_seconds=entry.rest_seconds,
                target_min_reps=entry.target_min_reps,
                target_max_reps=entry.target_max_reps,
                target_rir=entry.target_rir,
                stamps=_stamps(entry),
                sets=tuple(
                    SetDoc(
                        id=one.id,
                        set_index=one.set_index,
                        set_type=one.set_type,
                        weight_kg=one.weight_kg,
                        reps=one.reps,
                        rir=one.rir,
                        distance_m=one.distance_m,
                        duration_s=one.duration_s,
                        is_completed=one.is_completed,
                        completed_at=one.completed_at,
                        planned_set_id=one.planned_set_id,
                        stamps=_stamps(one),
                    )
                    for one in entry.sets
                ),
            )
            for entry in body.exercises
        ),
    )


def _stamp_fields(stamps: Stamps) -> dict[str, object]:
    return {
        "created_at": stamps.created_at,
        "updated_at": stamps.updated_at,
        "deleted_at": stamps.deleted_at,
    }


def _root_fields(doc: WorkoutDoc) -> dict[str, object]:
    return {
        "id": doc.id,
        "routine_id": doc.routine_id,
        "planned_session_id": doc.planned_session_id,
        "title": doc.title,
        "started_at": doc.started_at,
        "ended_at": doc.ended_at,
        "local_date": doc.local_date,
        "tz": doc.tz,
        "notes": doc.notes,
        "perceived_fatigue": doc.perceived_fatigue,
        "source": doc.source,
        **_stamp_fields(doc.stamps),
    }


def _summary(doc: WorkoutDoc) -> WorkoutSummary:
    return WorkoutSummary.model_validate(_root_fields(doc))


def _response(doc: WorkoutDoc) -> WorkoutResponse:
    return WorkoutResponse.model_validate(
        {
            **_root_fields(doc),
            "exercises": [
                {
                    "id": entry.id,
                    "exercise_id": entry.exercise_id,
                    "order_index": entry.order_index,
                    "superset_group": entry.superset_group,
                    "notes": entry.notes,
                    "planned_exercise_id": entry.planned_exercise_id,
                    "rest_seconds": entry.rest_seconds,
                    "target_min_reps": entry.target_min_reps,
                    "target_max_reps": entry.target_max_reps,
                    "target_rir": entry.target_rir,
                    **_stamp_fields(entry.stamps),
                    "sets": [
                        {
                            "id": one.id,
                            "set_index": one.set_index,
                            "set_type": one.set_type,
                            "weight_kg": one.weight_kg,
                            "reps": one.reps,
                            "rir": one.rir,
                            "distance_m": one.distance_m,
                            "duration_s": one.duration_s,
                            "is_completed": one.is_completed,
                            "completed_at": one.completed_at,
                            "planned_set_id": one.planned_set_id,
                            **_stamp_fields(one.stamps),
                        }
                        for one in entry.sets
                    ],
                }
                for entry in doc.exercises
            ],
        }
    )
