/**
 * The privacy key's wrapping KDF (ADR-007): argon2id at 64 MiB, three iterations, one lane — libsodium's argon2id is
 * single-lane, and parallelism changes nothing about an attacker's cost per guess.
 *
 * Never cheaper than the API's login hash: a wrapped key is a password-guessing oracle, so its memory and iterations
 * are each at least packages/shared/security/password-kdf.json's, and a test fails if either side moves below.
 */

export interface WrappingKdf {
  readonly memoryKib: number;
  readonly iterations: number;
  readonly parallelism: number;
}

export const WRAPPING_KDF: WrappingKdf = { memoryKib: 65_536, iterations: 3, parallelism: 1 };

const KDF_TEXT = /^argon2id\$m=(\d{1,9}),t=(\d{1,4}),p=(\d{1,3})$/;

/** As stored beside every wrap, in `users.privacy_key_kdf`, and as the API checks it. */
export function formatKdf(kdf: WrappingKdf): string {
  return `argon2id$m=${kdf.memoryKib},t=${kdf.iterations},p=${kdf.parallelism}`;
}

/** The parameters a stored wrap was made under, or null for anything this build cannot reproduce. */
export function parseKdf(text: string): WrappingKdf | null {
  const match = KDF_TEXT.exec(text);
  if (match === null) {
    return null;
  }
  const [memoryKib, iterations, parallelism] = match.slice(1).map(Number);
  return parallelism === 1 ? { memoryKib, iterations, parallelism } : null;
}
