"""Which schema revisions this build of the API knows, for readiness (06 §5)."""

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

API_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class MigrationTree:
    head: str
    known_revisions: frozenset[str]


@lru_cache
def migration_tree() -> MigrationTree:
    config = Config(str(API_ROOT / "alembic.ini"))
    scripts = ScriptDirectory.from_config(config)
    head = scripts.get_current_head()
    if head is None:
        raise RuntimeError("no Alembic revisions found")
    return MigrationTree(
        head=head,
        known_revisions=frozenset(script.revision for script in scripts.walk_revisions()),
    )
