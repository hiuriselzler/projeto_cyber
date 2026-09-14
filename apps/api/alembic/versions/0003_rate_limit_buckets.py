"""Rate-limit windows, counted in Postgres (ADR-015, 04 §5).

The table holds nobody's data — an HMAC of an IP or an email, a window and a count — so it has no
owner, no row-level security and no sync columns (03 §11). The app role reads and writes it through
the default privileges.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-14
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE rate_limit_buckets (
            bucket_key text NOT NULL,
            window_start timestamptz NOT NULL,
            hits integer NOT NULL CHECK (hits > 0),
            PRIMARY KEY (bucket_key, window_start)
        )
        """
    )
    op.execute(
        "CREATE INDEX rate_limit_buckets_window_start_idx ON rate_limit_buckets (window_start)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE rate_limit_buckets")
