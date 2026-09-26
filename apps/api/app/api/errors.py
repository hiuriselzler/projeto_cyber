"""Service refusals as HTTP (04 §4, §5). The body is always `{"error": code}`."""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.services.errors import (
    ConflictError,
    EmailNotVerifiedError,
    InvalidCredentialsError,
    InvalidPrivacyKeyError,
    InvalidRequestError,
    InvalidTokenError,
    NotFoundError,
    PasswordRejectedError,
    RateLimitedError,
    RefreshRejectedError,
    ServiceError,
    UnauthenticatedError,
    UnprocessableError,
    WrongPasswordError,
)

STATUS_CODES: dict[type[ServiceError], int] = {
    NotFoundError: status.HTTP_404_NOT_FOUND,
    ConflictError: status.HTTP_409_CONFLICT,
    InvalidRequestError: status.HTTP_400_BAD_REQUEST,
    UnauthenticatedError: status.HTTP_401_UNAUTHORIZED,
    InvalidCredentialsError: status.HTTP_401_UNAUTHORIZED,
    RefreshRejectedError: status.HTTP_401_UNAUTHORIZED,
    # Not 401: a client refreshes its session on 401, and a mistyped current password is not a lost
    # session.
    WrongPasswordError: status.HTTP_403_FORBIDDEN,
    EmailNotVerifiedError: status.HTTP_403_FORBIDDEN,
    InvalidTokenError: status.HTTP_400_BAD_REQUEST,
    PasswordRejectedError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    InvalidPrivacyKeyError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    UnprocessableError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    RateLimitedError: status.HTTP_429_TOO_MANY_REQUESTS,
}


def status_code_of(error: ServiceError) -> int:
    for kind in type(error).__mro__:
        if kind in STATUS_CODES:
            return STATUS_CODES[kind]
    return status.HTTP_400_BAD_REQUEST


async def _service_error(_request: Request, error: Exception) -> JSONResponse:
    if not isinstance(error, ServiceError):
        raise error
    headers: dict[str, str] = {}
    if isinstance(error, RateLimitedError):
        headers["Retry-After"] = str(error.retry_after_s)
    if isinstance(error, UnauthenticatedError):
        headers["WWW-Authenticate"] = "Bearer"
    return JSONResponse({"error": error.code}, status_code=status_code_of(error), headers=headers)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ServiceError, _service_error)
