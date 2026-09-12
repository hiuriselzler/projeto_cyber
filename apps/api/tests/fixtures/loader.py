"""Loads the shared domain fixtures from packages/shared/fixtures — the files Jest reads too."""

import json
from pathlib import Path
from typing import Any

FIXTURES_DIR = Path(__file__).resolve().parents[4] / "packages" / "shared" / "fixtures"


def load_fixture(name: str) -> Any:
    return json.loads((FIXTURES_DIR / f"{name}.json").read_text(encoding="utf-8"))
