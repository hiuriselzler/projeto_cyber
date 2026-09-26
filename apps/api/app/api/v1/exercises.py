"""/api/v1/exercises — the catalog: the globals and the user's own (task 004 stage 8, 02 §5)."""

import uuid

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import CurrentUser, Exercises, default_rate_limit
from app.api.v1.paging import Limit, after_cursor, read_after
from app.schemas.common import ErrorResponse
from app.schemas.exercises import ExercisePage, ExerciseResponse, ExerciseWrite
from app.services.exercises import ExerciseDoc
from app.services.upserts import Stamps

router = APIRouter(
    prefix="/exercises", tags=["exercises"], dependencies=[Depends(default_rate_limit)]
)


@router.get("", responses={400: {"model": ErrorResponse}})
async def list_exercises(
    principal: CurrentUser,
    service: Exercises,
    after: str | None = None,
    limit: Limit = 200,
    include_archived: bool = False,
) -> ExercisePage:
    """The global catalog and the user's own exercises, by id, a page at a time."""
    page = await service.list(
        principal, after=read_after(after), limit=limit, include_archived=include_archived
    )
    return ExercisePage(
        items=[_response(item) for item in page.items], next=after_cursor(page.next_after)
    )


@router.get("/{exercise_id}", responses={404: {"model": ErrorResponse}})
async def get_exercise(
    exercise_id: uuid.UUID, principal: CurrentUser, service: Exercises
) -> ExerciseResponse:
    """A global or one of the user's own. Someone else's answers 404, like an absent one (04 §4)."""
    return _response(await service.get(principal, exercise_id))


@router.put(
    "/{exercise_id}",
    responses={
        201: {"model": ExerciseResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
async def put_exercise(
    exercise_id: uuid.UUID,
    body: ExerciseWrite,
    principal: CurrentUser,
    service: Exercises,
    response: Response,
) -> ExerciseResponse:
    """Creates or updates one of the user's own exercises (decision 3). The copy with the newer
    `updated_at` wins; a global's id, like somebody else's, is `409 id_unavailable`."""
    stored, created = await service.put(principal, _doc(exercise_id, body))
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return _response(stored)


def _doc(exercise_id: uuid.UUID, body: ExerciseWrite) -> ExerciseDoc:
    return ExerciseDoc(
        id=exercise_id,
        forked_from_id=body.forked_from_id,
        name=body.name,
        name_key=None,
        modality=body.modality,
        primary_muscle_id=body.primary_muscle_id,
        secondary_muscle_ids=tuple(body.secondary_muscle_ids),
        is_unilateral=body.is_unilateral,
        tracking=body.tracking,
        load_increment_kg=body.load_increment_kg,
        uses_bodyweight=body.uses_bodyweight,
        default_min_reps=body.default_min_reps,
        default_max_reps=body.default_max_reps,
        notes=body.notes,
        stamps=Stamps(body.created_at, body.updated_at, body.deleted_at),
    )


def _response(doc: ExerciseDoc) -> ExerciseResponse:
    return ExerciseResponse.model_validate(
        {
            "id": doc.id,
            "is_own": doc.is_own,
            "forked_from_id": doc.forked_from_id,
            "name": doc.name,
            "name_key": doc.name_key,
            "modality": doc.modality,
            "primary_muscle_id": doc.primary_muscle_id,
            "secondary_muscle_ids": list(doc.secondary_muscle_ids),
            "is_unilateral": doc.is_unilateral,
            "tracking": doc.tracking,
            "load_increment_kg": doc.load_increment_kg,
            "uses_bodyweight": doc.uses_bodyweight,
            "default_min_reps": doc.default_min_reps,
            "default_max_reps": doc.default_max_reps,
            "notes": doc.notes,
            "created_at": doc.stamps.created_at,
            "updated_at": doc.stamps.updated_at,
            "deleted_at": doc.stamps.deleted_at,
        }
    )
