import { eq, sql } from 'drizzle-orm';

import { db } from './client';
import { users } from './schema';

/**
 * The signed-in account's own row, kept on the device so that a launch with no network still knows who is signed in,
 * and in which language and units (NFR-1, ADR-008). Written from the API's answers until task 006 syncs it.
 */
export interface LocalAccount {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly displayName: string;
  readonly unitSystem: 'metric' | 'imperial';
  readonly locale: 'en' | 'pt-BR';
  readonly timezone: string;
}

export function saveLocalAccount(account: LocalAccount, nowMs: number): void {
  const changed = {
    email: account.email,
    displayName: account.displayName,
    unitSystem: account.unitSystem,
    locale: account.locale,
    timezone: account.timezone,
    updatedAt: nowMs,
  };
  db.insert(users)
    .values({
      id: account.id,
      ...changed,
      emailVerifiedAt: account.emailVerified ? nowMs : null,
      createdAt: nowMs,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        ...changed,
        // Keeps the first moment this device learned of the verification, rather than moving it on every save.
        emailVerifiedAt: account.emailVerified ? sql`coalesce(${users.emailVerifiedAt}, ${nowMs})` : null,
      },
    })
    .run();
}

export function readLocalAccount(id: string): LocalAccount | null {
  const row = db.select().from(users).where(eq(users.id, id)).get();
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerifiedAt !== null,
    displayName: row.displayName,
    unitSystem: row.unitSystem,
    locale: row.locale,
    timezone: row.timezone,
  };
}
