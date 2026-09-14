"""Every route outside /auth and /health needs a signed-in user (INV-15, task 003).

Held over the route table rather than trusted to each router, and the check itself is shown catching
an unguarded route, because a check that passes on everything proves nothing. FastAPI keeps included
routers lazily, so the table is read through `iter_route_contexts`, which yields each route with its
full path.
"""

from fastapi import FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute, iter_route_contexts

from app.api.deps import get_current_user
from app.api.v1 import PREFIX
from app.api.v1.auth import PUBLIC_PATHS
from app.main import create_app


def depends_on(dependant: Dependant, call: object) -> bool:
    return any(inner.call is call or depends_on(inner, call) for inner in dependant.dependencies)


def api_routes(app: FastAPI) -> list[tuple[str, APIRoute]]:
    return [
        (context.path, context.route)
        for context in iter_route_contexts(app.router.routes)
        if isinstance(context.route, APIRoute) and context.path is not None
    ]


def unguarded(app: FastAPI) -> set[str]:
    return {
        path.removeprefix(PREFIX)
        for path, route in api_routes(app)
        if path.startswith(PREFIX) and not depends_on(route.dependant, get_current_user)
    }


def test_the_table_is_read_in_full():
    paths = {path for path, _ in api_routes(create_app())}

    assert f"{PREFIX}/workouts/{{workout_id}}" in paths
    assert f"{PREFIX}/auth/register" in paths


def test_the_only_routes_open_before_sign_in_are_the_public_auth_routes():
    assert unguarded(create_app()) == PUBLIC_PATHS


def test_every_route_is_versioned_a_health_check_or_the_deletion_page():
    """The web deletion page (task 019) is the one API page outside /api/v1, and names no user."""
    paths = {path for path, _ in api_routes(create_app())}

    assert {path for path in paths if not path.startswith(PREFIX)} == {
        "/health",
        "/health/ready",
        "/account-deletion",
        "/account-deletion/confirm",
    }


def test_the_check_notices_a_route_that_forgot_its_user():
    app = create_app()

    async def leaky() -> dict[str, str]:
        return {}

    app.add_api_route(f"{PREFIX}/workouts/everything", leaky)

    assert "/workouts/everything" in unguarded(app)
