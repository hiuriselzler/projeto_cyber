"""/api/v1/workouts — the first routes over user-owned rows (task 003). Task 004 builds the rest."""

import uuid

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import CurrentUser, Workouts, default_rate_limit
from app.schemas.common import ErrorResponse
from app.schemas.workouts import WorkoutCreate, WorkoutResponse
from app.services.workouts import LoggedWorkout, NewWorkout

router = APIRouter(
    prefix="/workouts", tags=["workouts"], dependencies=[Depends(default_rate_limit)]
)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    responses={200: {"model": WorkoutResponse}, 409: {"model": ErrorResponse}},
)
async def log_workout(
    body: WorkoutCreate, principal: CurrentUser, service: Workouts, response: Response
) -> WorkoutResponse:
    """Idempotent by the client's id (INV-16): the same workout sent twice answers 200 with the
    stored one."""
    logged = await service.log(
        principal,
        NewWorkout(
            id=body.id,
            title=body.title,
            started_at=body.started_at,
            local_date=body.local_date,
            tz=body.tz,
            source=body.source,
            notes=body.notes,
        ),
    )
    if not logged.created:
        response.status_code = status.HTTP_200_OK
    return _response(logged)


@router.get("/{workout_id}", responses={404: {"model": ErrorResponse}})
async def get_workout(
    workout_id: uuid.UUID, principal: CurrentUser, service: Workouts
) -> WorkoutResponse:
    """404 for a workout that does not exist and for one that is somebody else's alike (04 §4)."""
    return _response(await service.get(principal, workout_id))


def _response(workout: LoggedWorkout) -> WorkoutResponse:
    return WorkoutResponse(
        id=workout.id,
        title=workout.title,
        started_at=workout.started_at,
        ended_at=workout.ended_at,
        local_date=workout.local_date,
        tz=workout.tz,
        source=workout.source,
        notes=workout.notes,
    )
