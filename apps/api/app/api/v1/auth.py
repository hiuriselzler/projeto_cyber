"""/api/v1/auth — sign-in and the account lifecycle (04 §2-§5, task 003).

Six routes are public, because nobody is signed in when they are called: register, login, refresh,
both halves of a password reset, and email verification (the link may open on a device that is
signed out). Every other route depends on `get_current_user`, and a test over the route table holds
that true.
"""

import base64
import uuid

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import Auth, Client, CurrentUser, default_rate_limit
from app.schemas.auth import (
    AcceptedResponse,
    AccountResponse,
    AccountUpdate,
    EmailChangeRequest,
    EmailVerifyRequest,
    LoginRequest,
    PasswordChangeRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    PrivacyKeyIn,
    PrivacyKeyOut,
    RefreshRequest,
    RegisterRequest,
    SessionResponse,
    SignedInResponse,
    TokensResponse,
)
from app.schemas.common import ErrorResponse
from app.services.auth.service import (
    Account,
    LoginAttempt,
    PasswordChange,
    PasswordReset,
    Registration,
    SignedIn,
    Tokens,
    WrappedPrivacyKey,
)

router = APIRouter(prefix="/auth", tags=["auth"])

PUBLIC_PATHS = frozenset(
    {
        "/auth/register",
        "/auth/login",
        "/auth/refresh",
        "/auth/password-reset/request",
        "/auth/password-reset/confirm",
        "/auth/email/verify",
    }
)


def _errors(*codes: int) -> dict[int | str, dict[str, object]]:
    return {code: {"model": ErrorResponse} for code in codes}


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    responses=_errors(409, 422, 429),
)
async def register(body: RegisterRequest, client: Client, service: Auth) -> SignedInResponse:
    registration = Registration(
        user_id=body.id,
        email=body.email,
        password=body.password,
        display_name=body.display_name,
        locale=body.locale,
        unit_system=body.unit_system,
        timezone=body.timezone,
        device_id=body.device_id,
        device_name=body.device_name,
        privacy_key=_wrapped(body.privacy_key),
    )
    return _signed_in(await service.register(registration, client))


@router.post("/login", responses=_errors(401, 429))
async def login(body: LoginRequest, client: Client, service: Auth) -> SignedInResponse:
    attempt = LoginAttempt(body.email, body.password, body.device_id, body.device_name)
    return _signed_in(await service.login(attempt, client))


@router.post("/refresh", responses=_errors(401, 429))
async def refresh(body: RefreshRequest, client: Client, service: Auth) -> TokensResponse:
    return TokensResponse(**_tokens(await service.refresh(body.refresh_token, client)))


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(default_rate_limit)],
)
async def logout(principal: CurrentUser, service: Auth) -> Response:
    await service.logout(principal)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/logout-all",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(default_rate_limit)],
)
async def logout_all(principal: CurrentUser, service: Auth) -> Response:
    await service.logout_all(principal)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", dependencies=[Depends(default_rate_limit)])
async def me(principal: CurrentUser, service: Auth) -> AccountResponse:
    return _account(await service.account(principal))


@router.patch("/me", dependencies=[Depends(default_rate_limit)], responses=_errors(400))
async def update_me(body: AccountUpdate, principal: CurrentUser, service: Auth) -> AccountResponse:
    changes = body.model_dump(exclude_unset=True)
    return _account(await service.update_account(principal, changes))


@router.post(
    "/password/change",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=_errors(403, 422, 429),
)
async def change_password(
    body: PasswordChangeRequest, principal: CurrentUser, client: Client, service: Auth
) -> Response:
    change = PasswordChange(body.current_password, body.new_password, _wrapped(body.privacy_key))
    await service.change_password(principal, change, client)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/password-reset/request",
    status_code=status.HTTP_202_ACCEPTED,
    responses=_errors(429),
)
async def request_password_reset(
    body: PasswordResetRequest, client: Client, service: Auth
) -> AcceptedResponse:
    await service.request_password_reset(body.email, client)
    return AcceptedResponse()


@router.post(
    "/password-reset/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=_errors(400, 422, 429),
)
async def confirm_password_reset(
    body: PasswordResetConfirmRequest, client: Client, service: Auth
) -> Response:
    reset = PasswordReset(body.token, body.new_password, _wrapped(body.privacy_key))
    await service.confirm_password_reset(reset, client)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/email/verify",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=_errors(400, 409, 429),
)
async def verify_email(body: EmailVerifyRequest, client: Client, service: Auth) -> Response:
    await service.verify_email(body.token, client)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/email/verification", status_code=status.HTTP_202_ACCEPTED, responses=_errors(429))
async def resend_verification(
    principal: CurrentUser, client: Client, service: Auth
) -> AcceptedResponse:
    await service.resend_verification(principal, client)
    return AcceptedResponse()


@router.post(
    "/email/change",
    status_code=status.HTTP_202_ACCEPTED,
    responses=_errors(400, 403, 429),
)
async def change_email(
    body: EmailChangeRequest, principal: CurrentUser, client: Client, service: Auth
) -> AcceptedResponse:
    await service.change_email(principal, body.current_password, body.new_email, client)
    return AcceptedResponse()


@router.get("/sessions", dependencies=[Depends(default_rate_limit)])
async def sessions(principal: CurrentUser, service: Auth) -> list[SessionResponse]:
    return [
        SessionResponse(
            id=item.id,
            device_id=item.device_id,
            device_name=item.device_name,
            last_active_at=item.last_active_at,
            current=item.current,
        )
        for item in await service.sessions(principal)
    ]


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(default_rate_limit)],
    responses=_errors(404),
)
async def revoke_session(session_id: uuid.UUID, principal: CurrentUser, service: Auth) -> Response:
    await service.revoke_session(principal, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _wrapped(body: PrivacyKeyIn) -> WrappedPrivacyKey:
    return WrappedPrivacyKey(body.wrapped_key, body.salt, body.kdf)


def _tokens(tokens: Tokens) -> dict[str, object]:
    return {
        "access_token": tokens.access_token,
        "access_expires_at": tokens.access_expires_at,
        "refresh_token": tokens.refresh_token,
        "refresh_expires_at": tokens.refresh_expires_at,
    }


def _account(account: Account) -> AccountResponse:
    key = account.privacy_key
    return AccountResponse(
        id=account.id,
        email=account.email,
        email_verified=account.email_verified,
        display_name=account.display_name,
        unit_system=account.unit_system,
        locale=account.locale,
        timezone=account.timezone,
        birth_date=account.birth_date,
        sex=account.sex,
        max_hr=account.max_hr,
        resting_hr=account.resting_hr,
        gamification_enabled=account.gamification_enabled,
        privacy_key=None
        if key is None
        else PrivacyKeyOut(
            wrapped_key=base64.b64encode(key.wrapped_key).decode("ascii"),
            salt=base64.b64encode(key.salt).decode("ascii"),
            kdf=key.kdf,
        ),
    )


def _signed_in(signed_in: SignedIn) -> SignedInResponse:
    return SignedInResponse(**_tokens(signed_in.tokens), account=_account(signed_in.account))
