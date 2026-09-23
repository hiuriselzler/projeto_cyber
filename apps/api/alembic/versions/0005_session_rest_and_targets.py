"""The live session carries its own rest and targets (task 004 stage 5, 03 §4).

Four nullable columns on `workout_exercises`, mirroring `routine_exercises`: copied from the routine
when a workout starts from one and editable during it, so editing the routine afterwards never moves
a rest timer that is already running. `rest_seconds` NULL means no timer, not a default.
`target_rir` is shown beside a set as a target and never written into `set_logs.rir` (INV-03).

The device's twin is `apps/mobile/src/db/migrations/0002_session_rest_and_targets.sql`. No policy
changes: the table's row-level security is on the row, and a new column inherits it.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-23
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE workout_exercises
            ADD COLUMN rest_seconds smallint,
            ADD COLUMN target_min_reps smallint,
            ADD COLUMN target_max_reps smallint,
            ADD COLUMN target_rir smallint
                CONSTRAINT workout_exercises_target_rir_check
                CHECK (target_rir IS NULL OR target_rir BETWEEN 0 AND 10);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE workout_exercises
            DROP COLUMN target_rir,
            DROP COLUMN target_max_reps,
            DROP COLUMN target_min_reps,
            DROP COLUMN rest_seconds;
        """
    )
