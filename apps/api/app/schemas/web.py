"""The account-deletion web page's forms (task 019), as strict as every JSON body (04 §5)."""

from app.schemas.auth import Email, Locale, OpaqueToken
from app.schemas.common import StrictModel


class DeletionLinkForm(StrictModel):
    email: Email
    lang: Locale | None = None


class DeletionConfirmForm(StrictModel):
    token: OpaqueToken
    lang: Locale | None = None
