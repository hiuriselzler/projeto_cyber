import { eq, sql } from 'drizzle-orm';

import { db } from './client';
import { users } from './schema';

/**
 * The signed-in account's own row, kept on the device so that a launch with no network still knows who is signed in,
 * in which language and units, and whether its deletion is pending (NFR-1, ADR-008, task 019). Written from the API's
 * answers until task 006 syncs it.
 */
export interface LocalAccount {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly displayName: string;
  readonly unitSystem: 'metric' | 'imperial';
  readonly locale: 'en' | 'pt-BR';
  readonly timezone: string;
  /** When a deletion still pending was asked for, in epoch milliseconds; null when none is. */
  readonly deletionRequestedAt: number | null;
}

export function saveLocalAccount(account: LocalAccount, nowMs: number): void {
  const changed = {
    email: account.email,
    displayName: account.displayName,
    unitSystem: account.unitSystem,
    locale: account.locale,
    timezone: account.timezone,
    deletionRequestedAt: account.deletionRequestedAt,
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
    deletionRequestedAt: row.deletionRequestedAt,
  };
}

/**
 * The account's row leaves the device with the session (task 019). What a device keeps of training data once its
 * session ends is task 006's to settle; there is none on a device before then.
 */
export function forgetLocalAccount(id: string): void {
  db.delete(users).where(eq(users.id, id)).run();
}
