"""Versioned routers under /api/v1 (02 §5)."""

from fastapi import APIRouter

from app.api.v1 import auth, exercises, routines, workouts

PREFIX = "/api/v1"

api_router = APIRouter(prefix=PREFIX)
api_router.include_router(auth.router)
api_router.include_router(exercises.router)
api_router.include_router(routines.router)
api_router.include_router(workouts.router)
