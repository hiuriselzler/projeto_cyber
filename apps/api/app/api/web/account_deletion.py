"""The account-deletion web page Google Play links to (task 019; 04 §2a).

Four routes, and only the two POSTs act. Opening the emailed link shows a page with a button,
because mail providers and link scanners open links on their own: a link that acted when opened
would schedule deletions nobody asked for.

The page sets no cookie, so there is no session for a forged request to ride; it loads nothing
from elsewhere, sends no referrer, is never cached and cannot be framed. Its forms are parsed here
rather than through FastAPI's form support, which needs a package of its own, and validated as
strictly as any JSON body (04 §5). Every string comes from the shared catalogs (INV-27), in English
or Portuguese as the browser prefers, with a link to the other.
"""

import html
from collections.abc import Mapping
from urllib.parse import parse_qs, urlencode

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from pydantic import ValidationError

from app.api.deps import AccountDeletion, Client
from app.core.i18n import Locale, as_locale, format_day, format_message, preferred_locale
from app.schemas.web import DeletionConfirmForm, DeletionLinkForm
from app.services.errors import InvalidTokenError, RateLimitedError

PAGE = "/account-deletion"
CONFIRM = "/account-deletion/confirm"
MAX_FORM_BYTES = 4096

SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; "
        "frame-ancestors 'none'; base-uri 'none'"
    ),
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
}

STYLE = (
    "body{font-family:system-ui,sans-serif;line-height:1.5;margin:0;padding:1.5rem}"
    "main{max-width:32rem;margin:0 auto}"
    "input,button{display:block;box-sizing:border-box;width:100%;margin:.5rem 0 1rem;"
    "padding:.75rem;font-size:1rem}"
)

router = APIRouter()


@router.get(PAGE)
async def deletion_page(request: Request, lang: str | None = None) -> HTMLResponse:
    locale = _locale(request, lang)
    return _page(locale, _link_form(locale))


@router.post(PAGE)
async def request_deletion_link(
    request: Request, client: Client, service: AccountDeletion
) -> HTMLResponse:
    fields = await _form(request)
    locale = _locale(request, (fields or {}).get("lang"))
    try:
        form = DeletionLinkForm.model_validate(fields)
    except ValidationError:
        return _page(locale, _link_form(locale, error="invalid_email"), status_code=400)
    try:
        await service.request_link(form.email, client)
    except RateLimitedError as error:
        return _rate_limited(locale, error)
    return _page(locale, _paragraph(locale, "request_sent", role="status"))


@router.get(CONFIRM)
async def confirmation_page(
    request: Request, token: str = "", lang: str | None = None
) -> HTMLResponse:
    """What confirming does, and the button. Reads nothing and changes nothing."""
    locale = _locale(request, lang)
    body = (
        _paragraph(locale, "confirm_intro")
        + f'<form method="post" action="{CONFIRM}">'
        + _hidden("token", token)
        + _hidden("lang", locale)
        + f'<button type="submit">{_text(locale, "confirm_submit")}</button></form>'
    )
    return _page(locale, body, switch={"token": token})


@router.post(CONFIRM)
async def confirm_deletion(
    request: Request, client: Client, service: AccountDeletion
) -> HTMLResponse:
    fields = await _form(request)
    locale = _locale(request, (fields or {}).get("lang"))
    try:
        form = DeletionConfirmForm.model_validate(fields)
        scheduled = await service.confirm_link(form.token, client)
    except (ValidationError, InvalidTokenError):
        return _invalid_link(locale)
    except RateLimitedError as error:
        return _rate_limited(locale, error)
    day = format_day(locale, scheduled.deleted_on)
    return _page(locale, _paragraph(locale, "scheduled", role="status", date=day))


# --- helpers --------------------------------------------------------------------------------------


def _locale(request: Request, requested: str | None) -> Locale:
    """The language the page was asked for, else the one the browser prefers."""
    if requested in ("en", "pt-BR"):
        return as_locale(requested)
    return preferred_locale(request.headers.get("accept-language", ""))


async def _form(request: Request) -> dict[str, str] | None:
    """A urlencoded form of single-valued fields, or None for any other body."""
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type != "application/x-www-form-urlencoded":
        return None
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_FORM_BYTES:
            return None
    try:
        parsed = parse_qs(body.decode("utf-8"), keep_blank_values=True, max_num_fields=8)
    except (UnicodeDecodeError, ValueError):
        return None
    if any(len(values) != 1 for values in parsed.values()):
        return None
    return {name: values[0] for name, values in parsed.items()}


def _text(locale: Locale, key: str, **arguments: str) -> str:
    return html.escape(format_message(locale, f"web.account_deletion.{key}", arguments))


def _paragraph(locale: Locale, key: str, *, role: str | None = None, **arguments: str) -> str:
    attribute = f' role="{role}"' if role else ""
    return f"<p{attribute}>{_text(locale, key, **arguments)}</p>"


def _hidden(name: str, value: str) -> str:
    return f'<input type="hidden" name="{name}" value="{html.escape(value)}">'


def _link_form(locale: Locale, *, error: str | None = None) -> str:
    return (
        _paragraph(locale, "intro")
        + (_paragraph(locale, error, role="alert") if error else "")
        + f'<form method="post" action="{PAGE}">'
        + _hidden("lang", locale)
        + f'<label for="email">{_text(locale, "email_label")}</label>'
        + '<input id="email" name="email" type="email" autocomplete="email" required>'
        + f'<button type="submit">{_text(locale, "request_submit")}</button></form>'
    )


def _invalid_link(locale: Locale) -> HTMLResponse:
    again = html.escape(f"{PAGE}?{urlencode({'lang': locale})}")
    body = (
        _paragraph(locale, "invalid_link", role="alert")
        + f'<p><a href="{again}">{_text(locale, "request_again")}</a></p>'
    )
    return _page(locale, body, status_code=400)


def _rate_limited(locale: Locale, error: RateLimitedError) -> HTMLResponse:
    return _page(
        locale,
        _paragraph(locale, "rate_limited", role="alert"),
        status_code=429,
        headers={"Retry-After": str(error.retry_after_s)},
    )


def _page(
    locale: Locale,
    body: str,
    *,
    switch: Mapping[str, str] | None = None,
    status_code: int = 200,
    headers: Mapping[str, str] | None = None,
) -> HTMLResponse:
    """The whole document, with a link to the same page in the other language."""
    other: Locale = "en" if locale == "pt-BR" else "pt-BR"
    query = {**(switch or {}), "lang": other}
    path = CONFIRM if "token" in query else PAGE
    href = html.escape(f"{path}?{urlencode(query)}")
    title = _text(locale, "title")
    document = (
        f'<!doctype html><html lang="{locale}"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{title}</title><style>{STYLE}</style></head><body><main>"
        f"<h1>{title}</h1>{body}"
        f'<p><a href="{href}" hreflang="{other}" lang="{other}">'
        f"{_text(locale, 'other_language')}</a></p>"
        "</main></body></html>"
    )
    return HTMLResponse(
        document,
        status_code=status_code,
        headers={**SECURITY_HEADERS, "Content-Language": locale, **(headers or {})},
    )
