"""The API's web pages, outside /api/v1 (task 019): today only the account-deletion page Google Play
links to. Left out of the OpenAPI schema, which describes the API the app calls."""

from fastapi import APIRouter

from app.api.web import account_deletion

web_router = APIRouter(include_in_schema=False)
web_router.include_router(account_deletion.router)
