import { db, sqlite } from './client';
import { launches } from './schema';

export interface LocalDatabaseState {
  /** Rows in Drizzle's migration log. Stays at 1 across launches if migrations are idempotent. */
  readonly migrationsApplied: number;
  /** Grows by one per launch, proving writes persist. */
  readonly launches: number;
}

let launchRecorded = false;

/** Records this launch once, however many times React runs the effect that calls it. */
export function recordLaunchOnce(launchedAt: string): void {
  if (launchRecorded) {
    return;
  }
  db.insert(launches).values({ launchedAt }).run();
  launchRecorded = true;
}

export function readLocalDatabaseState(): LocalDatabaseState {
  const migrations = sqlite.getFirstSync<{ count: number }>(
    'SELECT count(*) AS count FROM __drizzle_migrations',
  );
  return { migrationsApplied: migrations?.count ?? 0, launches: db.$count(launches) as unknown as number };
}
