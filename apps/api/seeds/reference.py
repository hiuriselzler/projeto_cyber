"""The reference data every install shares: seeded into Postgres, exported for the app.

The JSON files in `seeds/data/` are the source. Rows carry translation keys and never translated
text (INV-27); the text is in `packages/shared/i18n/`. Seeding is an idempotent upsert that changes
a row only when its data changed, so running it twice writes nothing the second time.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import Connection, text

DATA = Path(__file__).resolve().parent / "data"

Row = dict[str, Any]


def _load(name: str) -> list[Row]:
    rows: list[Row] = json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))
    return rows


@dataclass(frozen=True)
class ReferenceData:
    muscle_groups: list[Row]
    modality_increments: list[Row]
    gamification_tracks: list[Row]
    sport_profiles: list[Row]
    achievements: list[Row]
    exercises: list[Row]

    @classmethod
    def load(cls) -> "ReferenceData":
        return cls(
            muscle_groups=_load("muscle_groups"),
            modality_increments=_load("modality_increments"),
            gamification_tracks=_load("gamification_tracks"),
            sport_profiles=_load("sport_profiles"),
            achievements=_load("achievements"),
            exercises=_load("exercises"),
        )

    def exercise_rows(self) -> list[Row]:
        """Exercises with their muscles resolved to ids, as the database and the app store them."""
        muscle_ids = {row["name_key"]: row["id"] for row in self.muscle_groups}
        rows = []
        for exercise in self.exercises:
            row = {key: value for key, value in exercise.items() if not key.endswith("muscles")}
            row.pop("primary_muscle")
            row["primary_muscle_id"] = muscle_ids[f"muscle.{exercise['primary_muscle']}"]
            row["secondary_muscle_ids"] = sorted(
                muscle_ids[f"muscle.{muscle}"] for muscle in exercise["secondary_muscles"]
            )
            rows.append(row)
        return rows


@dataclass(frozen=True)
class SeedResult:
    rows_written: int


def seed(connection: Connection, data: ReferenceData | None = None) -> SeedResult:
    """Upserts every reference row. Run as cyberathlete_migrator, inside one transaction."""
    data = data or ReferenceData.load()
    written = 0

    written += _execute(
        connection,
        """
        INSERT INTO muscle_groups (id, name_key, region) VALUES (:id, :name_key, :region)
        ON CONFLICT (id) DO UPDATE SET name_key = EXCLUDED.name_key, region = EXCLUDED.region
        WHERE (muscle_groups.name_key, muscle_groups.region)
            IS DISTINCT FROM (EXCLUDED.name_key, EXCLUDED.region)
        """,
        data.muscle_groups,
    )
    written += _execute(
        connection,
        """
        INSERT INTO modality_increments (modality, unit_system, increment_kg)
        VALUES (:modality, :unit_system, :increment_kg)
        ON CONFLICT (modality, unit_system) DO UPDATE SET increment_kg = EXCLUDED.increment_kg
        WHERE modality_increments.increment_kg IS DISTINCT FROM EXCLUDED.increment_kg
        """,
        data.modality_increments,
    )
    # level_scale_bp may only decrease (INV-22): a seed never raises one that has been lowered.
    written += _execute(
        connection,
        """
        INSERT INTO gamification_tracks (track, kind, hue_token, level_scale_bp)
        VALUES (:track, :kind, :hue_token, :level_scale_bp)
        ON CONFLICT (track) DO UPDATE SET
            kind = EXCLUDED.kind,
            hue_token = EXCLUDED.hue_token,
            level_scale_bp = LEAST(gamification_tracks.level_scale_bp, EXCLUDED.level_scale_bp)
        WHERE (gamification_tracks.kind, gamification_tracks.hue_token,
               gamification_tracks.level_scale_bp)
            IS DISTINCT FROM (EXCLUDED.kind, EXCLUDED.hue_token,
                              LEAST(gamification_tracks.level_scale_bp, EXCLUDED.level_scale_bp))
        """,
        data.gamification_tracks,
    )
    written += _execute(
        connection,
        """
        INSERT INTO sport_profiles (
            sport, name_key, recording_mode, primary_metric, pace_unit_metric, pace_unit_imperial,
            split_unit_m_metric, split_unit_m_imperial, has_route, has_elevation,
            autopause_threshold_mps, live_fields, detail_sections, session_types, metrics_schema,
            xp_track
        ) VALUES (
            :sport, :name_key, :recording_mode, :primary_metric, :pace_unit_metric,
            :pace_unit_imperial, :split_unit_m_metric, :split_unit_m_imperial, :has_route,
            :has_elevation, :autopause_threshold_mps, CAST(:live_fields AS jsonb),
            CAST(:detail_sections AS jsonb), CAST(:session_types AS jsonb),
            CAST(:metrics_schema AS jsonb), :xp_track
        )
        ON CONFLICT (sport) DO UPDATE SET
            name_key = EXCLUDED.name_key,
            recording_mode = EXCLUDED.recording_mode,
            primary_metric = EXCLUDED.primary_metric,
            pace_unit_metric = EXCLUDED.pace_unit_metric,
            pace_unit_imperial = EXCLUDED.pace_unit_imperial,
            split_unit_m_metric = EXCLUDED.split_unit_m_metric,
            split_unit_m_imperial = EXCLUDED.split_unit_m_imperial,
            has_route = EXCLUDED.has_route,
            has_elevation = EXCLUDED.has_elevation,
            autopause_threshold_mps = EXCLUDED.autopause_threshold_mps,
            live_fields = EXCLUDED.live_fields,
            detail_sections = EXCLUDED.detail_sections,
            session_types = EXCLUDED.session_types,
            metrics_schema = EXCLUDED.metrics_schema,
            xp_track = EXCLUDED.xp_track
        WHERE (sport_profiles.*) IS DISTINCT FROM (EXCLUDED.*)
        """,
        [
            _with_json(row, "live_fields", "detail_sections", "session_types", "metrics_schema")
            for row in data.sport_profiles
        ],
    )
    written += _execute(
        connection,
        """
        INSERT INTO achievements (code, name_key, description_key, track, tier, unit_system)
        VALUES (:code, :name_key, :description_key, :track, :tier, :unit_system)
        ON CONFLICT (code) DO UPDATE SET
            name_key = EXCLUDED.name_key,
            description_key = EXCLUDED.description_key,
            track = EXCLUDED.track,
            tier = EXCLUDED.tier,
            unit_system = EXCLUDED.unit_system
        WHERE (achievements.*) IS DISTINCT FROM (EXCLUDED.*)
        """,
        data.achievements,
    )
    written += _seed_exercises(connection, data.exercise_rows())
    return SeedResult(rows_written=written)


def _seed_exercises(connection: Connection, rows: list[Row]) -> int:
    """The global catalog. A change bumps the row's sync columns, so devices pull it (03 §11)."""
    wanted = {(row["id"], muscle) for row in rows for muscle in row["secondary_muscle_ids"]}
    ids = [row["id"] for row in rows]
    existing = {
        (str(exercise_id), muscle_group_id)
        for exercise_id, muscle_group_id in connection.execute(
            text(
                "SELECT exercise_id, muscle_group_id FROM exercise_secondary_muscles "
                "WHERE exercise_id = ANY(CAST(:ids AS uuid[]))"
            ),
            {"ids": ids},
        )
    }
    stale, missing = existing - wanted, wanted - existing
    written = 0

    # Stale secondaries go first: an exercise whose primary muscle moves onto a former secondary
    # would otherwise trip the FR-2.16 trigger.
    written += _execute(
        connection,
        "DELETE FROM exercise_secondary_muscles "
        "WHERE exercise_id = :exercise_id AND muscle_group_id = :muscle_group_id",
        [{"exercise_id": e, "muscle_group_id": m} for e, m in sorted(stale)],
    )
    written += _execute(
        connection,
        """
        INSERT INTO exercises (
            id, owner_user_id, name_key, modality, primary_muscle_id, is_unilateral, tracking,
            uses_bodyweight, default_min_reps, default_max_reps, created_at, updated_at
        ) VALUES (
            :id, NULL, :name_key, :modality, :primary_muscle_id, :is_unilateral, :tracking,
            :uses_bodyweight, :default_min_reps, :default_max_reps, now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
            name_key = EXCLUDED.name_key,
            modality = EXCLUDED.modality,
            primary_muscle_id = EXCLUDED.primary_muscle_id,
            is_unilateral = EXCLUDED.is_unilateral,
            tracking = EXCLUDED.tracking,
            uses_bodyweight = EXCLUDED.uses_bodyweight,
            default_min_reps = EXCLUDED.default_min_reps,
            default_max_reps = EXCLUDED.default_max_reps,
            updated_at = now(),
            sync_version = exercises.sync_version + 1
        WHERE (exercises.name_key, exercises.modality, exercises.primary_muscle_id,
               exercises.is_unilateral, exercises.tracking, exercises.uses_bodyweight,
               exercises.default_min_reps, exercises.default_max_reps)
            IS DISTINCT FROM (EXCLUDED.name_key, EXCLUDED.modality, EXCLUDED.primary_muscle_id,
               EXCLUDED.is_unilateral, EXCLUDED.tracking, EXCLUDED.uses_bodyweight,
               EXCLUDED.default_min_reps, EXCLUDED.default_max_reps)
        """,
        [{k: v for k, v in row.items() if k != "secondary_muscle_ids"} for row in rows],
    )
    written += _execute(
        connection,
        "INSERT INTO exercise_secondary_muscles (exercise_id, muscle_group_id) "
        "VALUES (:exercise_id, :muscle_group_id)",
        [{"exercise_id": e, "muscle_group_id": m} for e, m in sorted(missing)],
    )
    # A dependent travels in its root's payload, so a changed muscle list is a changed exercise.
    changed = sorted({exercise_id for exercise_id, _ in stale | missing})
    if changed:
        connection.execute(
            text(
                "UPDATE exercises SET updated_at = now(), sync_version = sync_version + 1 "
                "WHERE id = ANY(CAST(:ids AS uuid[]))"
            ),
            {"ids": changed},
        )
    return written


def _with_json(row: Row, *columns: str) -> Row:
    return {key: json.dumps(value) if key in columns else value for key, value in row.items()}


def _execute(connection: Connection, statement: str, rows: list[Row]) -> int:
    if not rows:
        return 0
    result = connection.execute(text(statement), rows)
    return max(result.rowcount, 0)
