import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

export const DATABASE_NAME = 'cyberathlete.db';

export const sqlite = openDatabaseSync(DATABASE_NAME);

/**
 * Foreign keys are **off by default in SQLite** — a compatibility decision from before they existed — and every
 * connection has to ask for them. The local schema declares 58 of them (03 §8, and
 * [ADR-013](../../../../docs/decisions/ADR-013.md)'s "the schema enforces itself"), so without this line the device
 * would declare constraints that Postgres enforces and it silently ignores.
 *
 * It has to run here, on the open connection and outside any transaction: `PRAGMA foreign_keys` is a no-op inside
 * one, which is the way this is usually got wrong.
 *
 * Found in task 004 while writing the seed, which needs the insert order the keys imply. Whether the pragma takes
 * effect on a real device is a device check, not something to take on trust from a line of code.
 */
sqlite.execSync('PRAGMA foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
