"""Known-bad: every call INV-10 bans inside app/domain. Linted only by tests/lint."""

import datetime
import os
import time
import uuid
from datetime import date
from datetime import datetime as clock


def reads_the_world() -> None:
    datetime.datetime.now()
    datetime.datetime.utcnow()
    clock.today()  # an alias must not hide the call
    date.today()
    time.time()
    time.monotonic()
    uuid.uuid1()
    uuid.uuid4()
    os.environ.get("ANYTHING")
    os.getenv("ANYTHING")
