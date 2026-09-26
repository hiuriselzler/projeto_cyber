"""`personal_records` holds one reps record per load (task 004 stage 7, 03 §4).

The table was keyed `UNIQUE (user_id, exercise_id, kind)`: one row per kind. But
`max_reps_at_weight` is one record per load - the most reps at 80 kg and the most at 100 kg are two
records, and the core keeps both - so the key could hold the reps record of one load only, and a
rebuild would have had to throw the rest away. Nothing had ever written the table, which is how
nothing found it.

Now two partial unique indexes: one row per kind for the other three kinds, one per load for reps;
and a CHECK that a reps record names its load and its count, without which the second index would
let NULL loads repeat. The table is a derived cache (03 §11) with no rows anywhere yet, and the
device has no such table, so nothing else moves.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-25
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE personal_records DROP CONSTRAINT personal_records_user_id_exercise_id_kind_key"
    )
    op.execute(
        """
        ALTER TABLE personal_records ADD CONSTRAINT personal_records_reps_names_its_load
            CHECK (kind <> 'max_reps_at_weight' OR (weight_kg IS NOT NULL AND reps IS NOT NULL))
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX personal_records_one_per_kind
            ON personal_records (user_id, exercise_id, kind)
            WHERE kind <> 'max_reps_at_weight'
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX personal_records_one_per_load
            ON personal_records (user_id, exercise_id, weight_kg)
            WHERE kind = 'max_reps_at_weight'
        """
    )


def downgrade() -> None:
    # Back to one row per kind. A cache, so its rows are dropped rather than squeezed into the old
    # key - the rebuild command writes them again (06 §5).
    op.execute("DELETE FROM personal_records")
    op.execute("DROP INDEX personal_records_one_per_load")
    op.execute("DROP INDEX personal_records_one_per_kind")
    op.execute("ALTER TABLE personal_records DROP CONSTRAINT personal_records_reps_names_its_load")
    op.execute(
        "ALTER TABLE personal_records ADD CONSTRAINT personal_records_user_id_exercise_id_kind_key "
        "UNIQUE (user_id, exercise_id, kind)"
    )
