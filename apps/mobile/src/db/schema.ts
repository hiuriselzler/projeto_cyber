import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// A throwaway table that proves local migrations run at startup and stay idempotent (task 001). Task
// 002 replaces it with the device schema in 03 §8. Not user data, so INV-16's UUID keys do not apply.
export const launches = sqliteTable('launches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  launchedAt: text('launched_at').notNull(),
});
