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
    # newline="\n": text mode would write CRLF on Windows, so the same command would produce a
    # different file on a Windows machine than in CI. .gitattributes normalises the repository to
    # LF either way, so nothing wrong ever reached it — but `git status` came back dirty after a
    # step the README prescribes, which reads exactly like drift (task 017).
    OUTPUT.write_text(
        json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
