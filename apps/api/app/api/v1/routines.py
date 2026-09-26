"""/api/v1/routines — templates, each with its exercises (task 004 stage 8, 02 §5)."""

import uuid

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import CurrentUser, Routines, default_rate_limit
from app.api.v1.paging import Limit, after_cursor, read_after
from app.schemas.common import ErrorResponse
from app.schemas.routines import (
    RoutineDocument,
    RoutineExerciseDocument,
    RoutinePage,
    RoutineResponse,
    RoutineSummary,
)
from app.services.routines import RoutineDoc, RoutineExerciseDoc
from app.services.upserts import Stamps

router = APIRouter(
    prefix="/routines", tags=["routines"], dependencies=[Depends(default_rate_limit)]
)


@router.get("", responses={400: {"model": ErrorResponse}})
async def list_routines(
    principal: CurrentUser,
    service: Routines,
    after: str | None = None,
    limit: Limit = 200,
    include_archived: bool = False,
) -> RoutinePage:
    """The user's routines, without their exercises, by id, a page at a time."""
    page = await service.list(
        principal, after=read_after(after), limit=limit, include_archived=include_archived
    )
    return RoutinePage(
        items=[_summary(item) for item in page.items], next=after_cursor(page.next_after)
    )


@router.get("/{routine_id}", responses={404: {"model": ErrorResponse}})
async def get_routine(
    routine_id: uuid.UUID, principal: CurrentUser, service: Routines
) -> RoutineResponse:
    """The routine and every exercise entry, archived ones included. 404 for someone else's."""
    return _response(await service.get(principal, routine_id))


@router.put(
    "/{routine_id}",
    responses={
        201: {"model": RoutineResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
async def put_routine(
    routine_id: uuid.UUID,
    body: RoutineDocument,
    principal: CurrentUser,
    service: Routines,
    response: Response,
) -> RoutineResponse:
    """Applies the document row by row — each row's newer `updated_at` wins, a row left out is
    kept — and answers with the routine as stored (decision 1). Idempotent: resending changes
    nothing."""
    stored, created = await service.put(principal, _doc(routine_id, body))
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return _response(stored)


def _stamps(body: RoutineDocument | RoutineExerciseDocument) -> Stamps:
    return Stamps(body.created_at, body.updated_at, body.deleted_at)


def _doc(routine_id: uuid.UUID, body: RoutineDocument) -> RoutineDoc:
    return RoutineDoc(
        id=routine_id,
        name=body.name,
        notes=body.notes,
        folder=body.folder,
        order_index=body.order_index,
        stamps=_stamps(body),
        exercises=tuple(
            RoutineExerciseDoc(
                id=entry.id,
                exercise_id=entry.exercise_id,
                order_index=entry.order_index,
                superset_group=entry.superset_group,
                target_sets=entry.target_sets,
                target_min_reps=entry.target_min_reps,
                target_max_reps=entry.target_max_reps,
                target_rir=entry.target_rir,
                rest_seconds=entry.rest_seconds,
                notes=entry.notes,
                stamps=_stamps(entry),
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


def _summary(doc: RoutineDoc) -> RoutineSummary:
    return RoutineSummary.model_validate(
        {
            "id": doc.id,
            "name": doc.name,
            "notes": doc.notes,
            "folder": doc.folder,
            "order_index": doc.order_index,
            **_stamp_fields(doc.stamps),
        }
    )


def _response(doc: RoutineDoc) -> RoutineResponse:
    return RoutineResponse.model_validate(
        {
            "id": doc.id,
            "name": doc.name,
            "notes": doc.notes,
            "folder": doc.folder,
            "order_index": doc.order_index,
            **_stamp_fields(doc.stamps),
            "exercises": [
                {
                    "id": entry.id,
                    "exercise_id": entry.exercise_id,
                    "order_index": entry.order_index,
                    "superset_group": entry.superset_group,
                    "target_sets": entry.target_sets,
                    "target_min_reps": entry.target_min_reps,
                    "target_max_reps": entry.target_max_reps,
                    "target_rir": entry.target_rir,
                    "rest_seconds": entry.rest_seconds,
                    "notes": entry.notes,
                    **_stamp_fields(entry.stamps),
                }
                for entry in doc.exercises
            ],
        }
    )
