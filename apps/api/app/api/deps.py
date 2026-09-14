"""Dependency wiring for the routers: the clock, the services, and who is asking (04 §3-§5).

Tests replace `get_clock`, `get_password_hasher` and `get_email_sender` through
`app.dependency_overrides`.
"""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.clock import Clock, system_clock
from app.core.config import get_settings
from app.core.db import get_session_factory
from app.core.email import EmailSender, email_sender
from app.core.rate_limit import DEFAULT
from app.core.scope import Principal, UserId
from app.core.security import InvalidAccessTokenError, PasswordHasher, read_access_token
from app.services.auth.deletion import AccountDeletionService, WebLinks
from app.services.auth.service import AppLinks, AuthService, ClientContext
from app.services.errors import UnauthenticatedError
from app.services.rate_limit import RateLimiter
from app.services.workouts import WorkoutService

_bearer = HTTPBearer(auto_error=False)


def get_clock() -> Clock:
    return system_clock


@lru_cache
def _password_hasher() -> PasswordHasher:
    return PasswordHasher()


def get_password_hasher() -> PasswordHasher:
    return _password_hasher()


def get_email_sender() -> EmailSender:
    """The transport the settings name (05 §5)."""
    return email_sender(get_settings())


ClockDependency = Annotated[Clock, Depends(get_clock)]


def get_rate_limiter(clock: ClockDependency) -> RateLimiter:
    secret = get_settings().jwt_secret.get_secret_value()
    return RateLimiter(get_session_factory(), secret=secret, clock=clock)


def get_auth_service(
    hasher: Annotated[PasswordHasher, Depends(get_password_hasher)],
    sender: Annotated[EmailSender, Depends(get_email_sender)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    clock: ClockDependency,
) -> AuthService:
    settings = get_settings()
    return AuthService(
        get_session_factory(),
        hasher=hasher,
        sender=sender,
        limiter=limiter,
        clock=clock,
        jwt_secret=settings.jwt_secret.get_secret_value(),
        links=AppLinks(settings.app_link_base),
    )


def get_account_deletion_service(
    hasher: Annotated[PasswordHasher, Depends(get_password_hasher)],
    sender: Annotated[EmailSender, Depends(get_email_sender)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    clock: ClockDependency,
) -> AccountDeletionService:
    return AccountDeletionService(
        get_session_factory(),
        hasher=hasher,
        sender=sender,
        limiter=limiter,
        clock=clock,
        links=WebLinks(get_settings().public_base_url),
    )


def get_workout_service(clock: ClockDependency) -> WorkoutService:
    return WorkoutService(get_session_factory(), clock=clock)


def client_context(request: Request) -> ClientContext:
    return ClientContext(ip=request.client.host if request.client else None)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    clock: ClockDependency,
) -> Principal:
    """The account and device an access token was issued to. Every route outside /auth depends on
    this."""
    if credentials is None:
        raise UnauthenticatedError
    secret = get_settings().jwt_secret.get_secret_value()
    try:
        claims = read_access_token(secret, credentials.credentials, now=clock())
    except InvalidAccessTokenError:
        raise UnauthenticatedError from None
    return Principal(UserId(claims.user_id), claims.device_id)


CurrentUser = Annotated[Principal, Depends(get_current_user)]
Client = Annotated[ClientContext, Depends(client_context)]
Auth = Annotated[AuthService, Depends(get_auth_service)]
AccountDeletion = Annotated[AccountDeletionService, Depends(get_account_deletion_service)]
Workouts = Annotated[WorkoutService, Depends(get_workout_service)]


async def default_rate_limit(
    principal: CurrentUser,
    client: Client,
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> None:
    """04 §5's "everything else": 600 an hour, per IP and per account."""
    await limiter.check(DEFAULT, ip=client.ip, account=str(principal.user_id))


async def require_verified_email(principal: CurrentUser, service: Auth) -> Principal:
    """For what an unverified account may not do — a data export, an email change. Never for
    training."""
    await service.require_verified_email(principal)
    return principal


VerifiedUser = Annotated[Principal, Depends(require_verified_email)]
