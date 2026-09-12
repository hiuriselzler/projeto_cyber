import { sqlite } from './client';

/** Every table in 03 §8 — 33 shared with Postgres, plus raw_gps_points, outbox and sync_state. */
export const EXPECTED_TABLES = 36;

export interface LocalDatabaseState {
  /** Rows in Drizzle's migration log. Unchanged across launches if migrations are idempotent. */
  readonly migrationsApplied: number;
  /** Application tables present, for task 017's check that the whole device schema exists. */
  readonly tables: number;
}

export function readLocalDatabaseState(): LocalDatabaseState {
  const migrations = sqlite.getFirstSync<{ count: number }>(
    'SELECT count(*) AS count FROM __drizzle_migrations',
  );
  const tables = sqlite.getFirstSync<{ count: number }>(
    "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' " +
      "AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'",
  );
  return { migrationsApplied: migrations?.count ?? 0, tables: tables?.count ?? 0 };
}
