"""A set's distance holds decimals (task 004 stage 5c, 03 §4).

`set_logs.distance_m` was an integer. An imperial user logging a 100 ft carry typed 30.48 m, which
stored as 30 and read back as 98 ft - the class of defect INV-02's precision work fixed for pounds,
arriving through distance. `numeric(9,3)` holds any foot value typed to a tenth exactly enough that
it reads back as typed. Widening int to numeric changes no stored value.

The device's twin is `apps/mobile/src/db/migrations/0003_set_distance_precision.sql`.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-23
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE set_logs ALTER COLUMN distance_m TYPE numeric(9,3)")


def downgrade() -> None:
    # Rounds any fractional metres back to whole ones: the loss this migration exists to prevent.
    op.execute(
        "ALTER TABLE set_logs ALTER COLUMN distance_m TYPE integer USING round(distance_m)::integer"
    )
