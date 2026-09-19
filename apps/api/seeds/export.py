"""Writes the reference data to packages/shared/seeds/reference.json: `python -m seeds.export`.

A new install must have a catalog before it has ever synced (task 002), so the app seeds its local
database from this file on first launch. It is generated from the same data the server is seeded
from, and CI fails if the committed copy is stale.
"""

import json
from pathlib import Path

from seeds.reference import ReferenceData

OUTPUT = Path(__file__).resolve().parents[3] / "packages" / "shared" / "seeds" / "reference.json"


def main() -> None:
    data = ReferenceData.load()
    export = {
        "muscle_groups": data.muscle_groups,
        "modality_increments": data.modality_increments,
        "gamification_tracks": data.gamification_tracks,
        "sport_profiles": data.sport_profiles,
        "achievements": data.achievements,
        "exercises": data.exercise_rows(),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    # newline="\n" for the same reason as scripts/export_openapi.py: text mode writes CRLF on
    # Windows, and this file must be byte-identical wherever it is generated (task 017).
    OUTPUT.write_text(
        json.dumps(export, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
