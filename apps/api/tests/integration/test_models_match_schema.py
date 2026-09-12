"""The SQLAlchemy models describe the migrated schema: same tables, columns, types and nullability.

Indexes, CHECKs and the composite `SET NULL (column)` references live only in the migrations and are
asserted by the schema check, so those differences are expected and ignored here.
"""

from typing import Any

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine

from app.models import Base

pytestmark = pytest.mark.integration

IGNORED = {
    "add_index",
    "remove_index",
    "add_fk",
    "remove_fk",
    "add_constraint",
    "remove_constraint",
}


def flatten(diffs: list[Any]) -> list[tuple[Any, ...]]:
    flat: list[tuple[Any, ...]] = []
    for diff in diffs:
        flat.extend(diff if isinstance(diff, list) else [diff])
    return flat


def test_models_match_the_migrated_schema(migrated, migrator_engine: Engine):
    with migrator_engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        diffs = flatten(compare_metadata(context, Base.metadata))

    drift = [diff for diff in diffs if diff[0] not in IGNORED]
    assert drift == []
