import io
import json

import httpx
import pytest

from app.core.logging import configure_logging
from app.main import create_app


@pytest.fixture
def log_output():
    app = create_app()
    output = io.StringIO()
    configure_logging(stream=output)
    yield app, output
    configure_logging()


def log_lines(output: io.StringIO) -> list[dict[str, object]]:
    return [json.loads(line) for line in output.getvalue().splitlines()]


async def get(app, path: str, headers: dict[str, str] | None = None) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path, headers=headers)


async def test_each_request_writes_exactly_one_json_line_with_its_request_id(log_output):
    app, output = log_output

    response = await get(app, "/health")

    [line] = log_lines(output)
    assert line["event"] == "request"
    assert line["method"] == "GET"
    assert line["path"] == "/health"
    assert line["status"] == 200
    assert line["request_id"] == response.headers["X-Request-ID"]


async def test_the_client_request_id_is_the_one_logged_and_echoed(log_output):
    app, output = log_output

    response = await get(app, "/health", headers={"X-Request-ID": "client-abc.123"})

    [line] = log_lines(output)
    assert line["request_id"] == "client-abc.123"
    assert response.headers["X-Request-ID"] == "client-abc.123"


@pytest.mark.parametrize("unusable", ["", "has spaces", "x" * 129, "semi;colon"])
async def test_an_unusable_client_request_id_is_replaced(log_output, unusable):
    app, output = log_output

    response = await get(app, "/health", headers={"X-Request-ID": unusable})

    [line] = log_lines(output)
    assert line["request_id"] != unusable
    assert line["request_id"] == response.headers["X-Request-ID"]


async def test_the_query_string_is_never_logged(log_output):
    app, output = log_output

    await get(app, "/health?email=someone@example.com")

    assert "someone@example.com" not in output.getvalue()
