"""What a service can refuse, by name. The routers turn each into a status code (app.api.errors)."""

from app.core.passwords import PasswordProblem


class ServiceError(Exception):
    code = "error"

    def __init__(self, code: str | None = None) -> None:
        if code is not None:
            self.code = code
        super().__init__(self.code)


class NotFoundError(ServiceError):
    """Absent — or present and somebody else's, which is reported identically (04 §4: 404, never
    403)."""

    code = "not_found"


class ConflictError(ServiceError):
    code = "conflict"


class InvalidRequestError(ServiceError):
    code = "invalid_request"


class UnprocessableError(ServiceError):
    """Well-formed, but not something that can be stored: a reference to a row the user cannot see,
    a completed set without its mode's measure, a name already taken (task 004 stage 8)."""

    code = "unprocessable"


class UnauthenticatedError(ServiceError):
    """No usable access token."""

    code = "unauthenticated"


class InvalidCredentialsError(ServiceError):
    """Login failed. Says nothing about which half was wrong."""

    code = "invalid_credentials"


class RefreshRejectedError(ServiceError):
    code = "refresh_rejected"


class WrongPasswordError(ServiceError):
    """A signed-in user re-entered their password wrongly, to change it or their email."""

    code = "password_incorrect"


class InvalidTokenError(ServiceError):
    """A reset or verification link that is unknown, used or expired — which of them is not said."""

    code = "invalid_token"


class EmailNotVerifiedError(ServiceError):
    code = "email_unverified"


class PasswordRejectedError(ServiceError):
    def __init__(self, problem: PasswordProblem) -> None:
        super().__init__(f"password_{problem}")


class InvalidPrivacyKeyError(ServiceError):
    """A wrapped privacy key of the wrong shape, or wrapped under a KDF cheaper than the login hash
    (ADR-007)."""

    code = "privacy_key_invalid"


class RateLimitedError(ServiceError):
    code = "rate_limited"

    def __init__(self, retry_after_s: int) -> None:
        super().__init__()
        self.retry_after_s = retry_after_s
