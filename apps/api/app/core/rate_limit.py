"""Rate-limit rules and bucket keys (04 §5, ADR-015).

Counting is one atomic upsert against Postgres (`app.repositories.rate_limits`), so a limit holds
across every API instance. A bucket key never carries an IP address or an email: the subject is an
HMAC under a key derived from `JWT_SECRET`.
"""

import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

SubjectKind = Literal["ip", "account"]

_KEY_LABEL = b"cyberathlete rate-limit subject v1"


@dataclass(frozen=True)
class RateLimitRule:
    name: str
    limit: int
    window: timedelta


# 04 §5, per IP and per account, whichever trips first.
LOGIN = RateLimitRule("login", 10, timedelta(minutes=15))
REGISTER = RateLimitRule("register", 5, timedelta(hours=1))
REFRESH = RateLimitRule("refresh", 60, timedelta(hours=1))
# Every endpoint that sends an email on request — a reset link, a verification link, an email change
# — so that none of them can be pointed at somebody's inbox 600 times an hour.
SENDS_EMAIL = RateLimitRule("sends_email", 10, timedelta(minutes=15))
DEFAULT = RateLimitRule("default", 600, timedelta(hours=1))


@dataclass(frozen=True)
class Bucket:
    key: str
    window_start: datetime
    window_end: datetime


def normalise_account(email: str) -> str:
    return email.strip().lower()


def bucket_for(
    rule: RateLimitRule, kind: SubjectKind, subject: str, *, secret: str, now: datetime
) -> Bucket:
    """The fixed window `now` falls in, and the key its hits are counted under."""
    window_s = int(rule.window.total_seconds())
    start = datetime.fromtimestamp(int(now.timestamp()) // window_s * window_s, UTC)
    key = hmac.new(secret.encode("utf-8"), _KEY_LABEL, hashlib.sha256).digest()
    digest = hmac.new(key, subject.encode("utf-8"), hashlib.sha256).hexdigest()
    return Bucket(f"{rule.name}:{kind}:{digest}", start, start + rule.window)
