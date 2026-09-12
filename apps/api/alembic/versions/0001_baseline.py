"""Baseline: an empty schema (task 001). Task 002 adds the first tables on top of it.

Revision ID: 0001
Revises:
Create Date: 2026-09-11
"""

from collections.abc import Sequence

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
