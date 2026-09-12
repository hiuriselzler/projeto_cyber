import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

export const DATABASE_NAME = 'cyberathlete.db';

export const sqlite = openDatabaseSync(DATABASE_NAME);

export const db = drizzle(sqlite, { schema });
