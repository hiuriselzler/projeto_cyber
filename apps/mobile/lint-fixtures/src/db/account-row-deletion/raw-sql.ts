// expect: no-restricted-syntax [fence:account-row-deletion]
// The same deletion written as SQL is the same cascade.
declare const sqlite: { runSync(source: string, ...params: string[]): void };

export function forget(id: string): void {
  sqlite.runSync('DELETE FROM users WHERE id = ?', id);
}
