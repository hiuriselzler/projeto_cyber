"""Seeds the reference data: `uv run python -m seeds` (06 §1). Connects as cyberathlete_migrator."""

from sqlalchemy import create_engine

from app.core.config import MigrationSettings
from seeds.reference import seed


def main() -> None:
    engine = create_engine(MigrationSettings().migration_database_url.get_secret_value())
    try:
        with engine.begin() as connection:
            result = seed(connection)
    finally:
        engine.dispose()
    print(f"reference data seeded: {result.rows_written} row(s) written")


if __name__ == "__main__":
    main()
