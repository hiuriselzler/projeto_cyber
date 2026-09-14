"""Registration and login: enumeration, timing, rate limits, new devices (04 §2, §5; ADR-015)."""

import statistics
import time
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.api.deps import get_rate_limiter
from app.core.config import get_settings
from app.core.db import create_engine
from app.core.security import PasswordHasher
from app.services.rate_limit import RateLimiter
from tests.integration.api_support import API, STRONG_PASSWORD, privacy_key

pytestmark = pytest.mark.integration

WRONG_PASSWORD = "not the password at all"


async def test_login_takes_as_long_for_a_missing_account_as_for_a_wrong_password(api_factory):
    """Under 20 ms apart over 100 runs each, with the production hasher (04 §2)."""
    api = await api_factory(hasher=PasswordHasher())
    email, _, _ = await api.register()
    missing = f"nobody-{uuid.uuid4().hex}@example.com"

    async def attempt(address: str) -> float:
        started = time.perf_counter()
        response = await api.login(address, WRONG_PASSWORD)
        elapsed = time.perf_counter() - started
        assert response.status_code == 401
        return elapsed

    for _warm_up in range(3):
        await attempt(email)
        await attempt(missing)
    existing: list[float] = []
    absent: list[float] = []
    for _run in range(100):
        existing.append(await attempt(email))
        absent.append(await attempt(missing))

    difference = abs(statistics.median(existing) - statistics.median(absent))
    assert difference < 0.020, (statistics.median(existing), statistics.median(absent))


async def test_a_wrong_password_and_a_missing_account_answer_identically(api_factory):
    api = await api_factory()
    email, _, _ = await api.register()

    wrong = await api.login(email, WRONG_PASSWORD)
    missing = await api.login(f"nobody-{uuid.uuid4().hex}@example.com", WRONG_PASSWORD)

    assert (wrong.status_code, wrong.json()) == (401, {"error": "invalid_credentials"})
    assert (missing.status_code, missing.json()) == (wrong.status_code, wrong.json())


async def test_the_eleventh_failed_login_is_refused_with_retry_after(api_factory):
    api = await api_factory(rate_limits=True)
    email, _, _ = await api.register()

    for _attempt in range(10):
        assert (await api.login(email, WRONG_PASSWORD)).status_code == 401
    refused = await api.login(email, WRONG_PASSWORD)

    assert (refused.status_code, refused.json()) == (429, {"error": "rate_limited"})
    assert 0 < int(refused.headers["Retry-After"]) <= 15 * 60


async def test_the_login_limit_holds_across_two_api_instances(
    api_factory, migrated, migrator_engine
):
    """The counters live in Postgres, so a second instance — with its own engine — sees the
    first's."""
    address = f"198.51.100.{uuid.uuid4().int % 250}"
    first = await api_factory(rate_limits=True, client_ip=address)
    second = await api_factory(rate_limits=True, client_ip=address, clock=first.clock)
    second_engine = create_engine(migrated.app)
    secret = get_settings().jwt_secret.get_secret_value()
    second.app.dependency_overrides[get_rate_limiter] = lambda: RateLimiter(
        async_sessionmaker(second_engine), secret=secret, clock=first.clock
    )
    try:
        email, _, _ = await first.register()
        for attempt in range(10):
            instance = first if attempt % 2 == 0 else second
            assert (await instance.login(email, WRONG_PASSWORD)).status_code == 401

        assert (await second.login(email, WRONG_PASSWORD)).status_code == 429
        assert (await first.login(email, WRONG_PASSWORD)).status_code == 429
    finally:
        await second_engine.dispose()

    with migrator_engine.connect() as connection:
        keys = [
            row.bucket_key
            for row in connection.execute(text("SELECT bucket_key FROM rate_limit_buckets"))
        ]
    assert keys
    assert not any(email in key or address in key for key in keys)


async def test_a_new_device_is_announced_by_email_and_a_known_one_is_not(api_factory):
    api = await api_factory()
    email, phone, _ = await api.register()
    assert api.mail_to(email, "new_device") == []

    await api.sign_in(email, device_id=phone.device_id)
    assert api.mail_to(email, "new_device") == []

    await api.sign_in(email, device_name="Tablet")
    announced = api.mail_to(email, "new_device")
    assert len(announced) == 1
    assert "Tablet" in announced[0].body
    assert STRONG_PASSWORD not in announced[0].body


async def test_an_address_already_in_use_is_refused_whatever_its_case(api_factory):
    """Registration discloses an existing account, behind its rate limit (ADR-015 §4)."""
    api = await api_factory()
    email, _, _ = await api.register()

    response = await api.client.post(
        f"{API}/auth/register", json=api.registration_body(email=email.upper())
    )

    assert (response.status_code, response.json()) == (409, {"error": "email_unavailable"})


@pytest.mark.parametrize(
    ("overrides", "error"),
    [
        ({"password": "short"}, "password_too_short"),
        ({"password": "1234567890"}, "password_breached"),
        ({"password": "QWERTYUIOP"}, "password_breached"),
        (
            {"privacy_key": {**privacy_key(), "kdf": "argon2id$m=19456,t=2,p=1"}},
            "privacy_key_invalid",
        ),
        ({"privacy_key": {**privacy_key(), "wrapped_key": "AAAA"}}, "privacy_key_invalid"),
    ],
)
async def test_registration_refuses_a_weak_password_or_a_weak_wrap(api_factory, overrides, error):
    api = await api_factory()

    response = await api.client.post(
        f"{API}/auth/register", json=api.registration_body(**overrides)
    )

    assert (response.status_code, response.json()) == (422, {"error": error})


@pytest.mark.parametrize(
    "overrides",
    [{"role": "admin"}, {"locale": "fr"}, {"timezone": "Mars/Olympus"}, {"email": "not-an-email"}],
)
async def test_registration_refuses_a_body_it_does_not_recognise(api_factory, overrides):
    api = await api_factory()

    response = await api.client.post(
        f"{API}/auth/register", json=api.registration_body(**overrides)
    )

    assert response.status_code == 422
