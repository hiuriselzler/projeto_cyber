import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { db } from './client';
import migrations from './migrations/migrations';

/**
 * The migration entry point the root layout calls (ADR-012 § Amendment). Local migrations run at
 * startup, before any screen renders (06 §4).
 *
 * Task 006 adds the pre-migration backup of a database holding unsynced work; there is no outbox yet.
 */
export function useLocalMigrations() {
  return useMigrations(db, migrations);
}
