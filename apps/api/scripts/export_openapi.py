"""Writes the API's OpenAPI schema to packages/shared/api/openapi.json.

`uv run python -m scripts.export_openapi`, then `pnpm --filter @cyberathlete/shared generate:api`
turns the schema into TypeScript types. It is exactly what the running API serves at /openapi.json,
read from the application object so that no database is needed. CI regenerates both files and fails
if either committed copy is stale.
"""

import json
from pathlib import Path

from app.main import create_app

OUTPUT = Path(__file__).resolve().parents[3] / "packages" / "shared" / "api" / "openapi.json"


def main() -> None:
    schema = create_app().openapi()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
