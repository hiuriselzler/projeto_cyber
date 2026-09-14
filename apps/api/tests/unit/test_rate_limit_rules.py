"""Rate-limit rules and bucket keys (04 §5, ADR-015). The counting is tested against Postgres."""

from datetime import UTC, datetime, timedelta

from app.core.rate_limit import (
    DEFAULT,
    LOGIN,
    REFRESH,
    REGISTER,
    bucket_for,
    normalise_account,
)

SECRET = "k7Qp2vX9mB4nR8sT1wY6zC3dF5gH0jL2aE9uI4oP7"
NOW = datetime(2026, 9, 14, 12, 7, 30, tzinfo=UTC)


def test_the_limits_are_the_ones_04_sets():
    assert (LOGIN.limit, LOGIN.window) == (10, timedelta(minutes=15))
    assert (REGISTER.limit, REGISTER.window) == (5, timedelta(hours=1))
    assert (REFRESH.limit, REFRESH.window) == (60, timedelta(hours=1))
    assert (DEFAULT.limit, DEFAULT.window) == (600, timedelta(hours=1))


def test_a_window_starts_on_its_boundary():
    bucket = bucket_for(LOGIN, "ip", "203.0.113.9", secret=SECRET, now=NOW)

    assert bucket.window_start == datetime(2026, 9, 14, 12, 0, tzinfo=UTC)
    assert bucket.window_end == datetime(2026, 9, 14, 12, 15, tzinfo=UTC)


def test_a_key_never_carries_the_address_or_the_email():
    by_ip = bucket_for(LOGIN, "ip", "203.0.113.9", secret=SECRET, now=NOW)
    by_account = bucket_for(LOGIN, "account", "user@example.com", secret=SECRET, now=NOW)

    assert by_ip.key.startswith("login:ip:")
    assert by_account.key.startswith("login:account:")
    assert "203.0.113.9" not in by_ip.key
    assert "user@example.com" not in by_account.key


def test_the_same_subject_in_the_same_window_counts_under_one_key():
    first = bucket_for(LOGIN, "ip", "203.0.113.9", secret=SECRET, now=NOW)
    later = bucket_for(LOGIN, "ip", "203.0.113.9", secret=SECRET, now=NOW + timedelta(minutes=5))
    next_window = bucket_for(
        LOGIN, "ip", "203.0.113.9", secret=SECRET, now=NOW + timedelta(minutes=10)
    )

    assert first == later
    assert next_window.window_start != first.window_start


def test_a_different_secret_gives_a_different_key():
    assert (
        bucket_for(LOGIN, "ip", "203.0.113.9", secret=SECRET, now=NOW).key
        != bucket_for(LOGIN, "ip", "203.0.113.9", secret=SECRET[::-1], now=NOW).key
    )


def test_an_account_is_counted_whatever_its_case_and_spacing():
    assert normalise_account("  User@Example.COM ") == "user@example.com"
