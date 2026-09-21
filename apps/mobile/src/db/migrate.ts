import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { db } from './client';
import migrations from './migrations/migrations';
import { seedReferenceData, type SeedOutcome } from './seed';

/**
 * The migration entry point the root layout calls (ADR-012 § Amendment). Local migrations run at
 * startup, before any screen renders (06 §4).
 *
 * Task 006 adds the pre-migration backup of a database holding unsynced work; there is no outbox yet.
 */
export function useLocalMigrations() {
  return useMigrations(db, migrations);
}

/**
 * Put the bundled reference catalog into the local database — 201 exercises, the muscle groups, the increments,
 * the tracks, the sport profiles and the achievements. **Called by the root layout once migrations have run**, from
 * the same effect that restores the session, because a device with a schema and no exercises cannot log anything
 * ([ADR-001](../../../../docs/decisions/ADR-001.md)).
 *
 * Not a hook and not a render-time call: seeding is startup work, not a rendering concern. It lives in this file
 * because this file *is* `src/db`'s startup entry point, and ADR-012 lets the root layout import exactly that.
 *
 * **Nothing called the seed between task 004 stage 2, which wrote it, and the stage-3 device pass, which found the
 * phone holding 36 tables and 0 exercises.** Every suite stayed green throughout, because they exercise the pure
 * `referenceSeedRows()` and never the wiring. It is the plainest argument in the project for measuring on a real
 * device before building anything on top of an assumption.
 *
 * Synchronous, and cheap after the first launch: its own SHA-256 fingerprint in `sync_state` decides whether there
 * is any work to do.
 */
export function seedLocalReferenceData(): SeedOutcome {
  return seedReferenceData();
}
