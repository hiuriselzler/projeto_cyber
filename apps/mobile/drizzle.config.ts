import { defineConfig } from 'drizzle-kit';

// The on-device schema (03 §8). `pnpm db:generate` writes a migration; the app runs it at startup.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
});
