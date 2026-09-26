// expect: no-restricted-syntax [fence:account-row-deletion]
// The line the stage 8 device pass found: ending a session deleted the account's row, and every set cascaded with it.
declare const users: { id: string };
declare const db: { delete(table: unknown): { where(clause: unknown): { run(): void } } };
declare function eq(column: unknown, value: unknown): unknown;

export function forgetLocalAccount(id: string): void {
  db.delete(users).where(eq(users.id, id)).run();
}
