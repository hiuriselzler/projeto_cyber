/**
 * The privacy key (ADR-007): 32 random bytes that encrypt the user's privacy zones, kept in secure storage on each
 * device and never sent anywhere in the clear. The server holds only a wrap of it — XChaCha20-Poly1305 under a key
 * derived from the password with argon2id — and the parameters of that derivation.
 *
 * `src/account` decides when to generate, unwrap or re-wrap; this file does it. Callers get wraps, never the key, and
 * the storage name below is private to this file — lint rejects it anywhere else.
 */
import * as SecureStore from 'expo-secure-store';
import {
  base64_variants,
  crypto_aead_xchacha20poly1305_ietf_decrypt,
  crypto_aead_xchacha20poly1305_ietf_encrypt,
  crypto_pwhash,
  from_base64,
  randombytes_buf,
  ready,
  to_base64,
} from 'react-native-libsodium';

import { formatKdf, parseKdf, WRAPPING_KDF, type WrappingKdf } from './kdf';

const PRIVACY_KEY_STORAGE = 'cyberathlete.privacy-key';
/** Binds each wrap to its purpose, so no other ciphertext under the same derived key can pass for one. */
const WRAP_CONTEXT = 'cyberathlete privacy key wrap v1';

// libsodium's sizes, fixed by its ABI: argon2id13, a 16-byte salt, and XChaCha20-Poly1305's nonce, key and tag.
const ARGON2ID13 = 2;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const NONCE_BYTES = 24;
const TAG_BYTES = 16;

/** 72 bytes: nonce ‖ ciphertext ‖ tag — what the API accepts (03 §1). */
export const WRAPPED_KEY_BYTES = NONCE_BYTES + KEY_BYTES + TAG_BYTES;

/** A wrap as the API stores it: base64 blobs and the KDF text. */
export interface WrappedPrivacyKey {
  readonly wrappedKey: string;
  readonly salt: string;
  readonly kdf: string;
}

/** A key made but not yet kept: kept only once the server has accepted its wrap. */
export interface PreparedPrivacyKey {
  readonly wrapped: WrappedPrivacyKey;
  commit(): Promise<void>;
}

export class PrivacyKeyError extends Error {
  constructor(readonly reason: 'missing' | 'unreadable' | 'wrong_password') {
    super(`privacy key: ${reason}`);
    this.name = 'PrivacyKeyError';
  }
}

/** Registration, and a password reset: a new key, wrapped under the password just chosen. */
export async function prepareNewPrivacyKey(password: string): Promise<PreparedPrivacyKey> {
  await ready;
  const key = randombytes_buf(KEY_BYTES);
  const wrapped = await wrap(key, password, WRAPPING_KDF);
  return { wrapped, commit: () => storeKey(key) };
}

/**
 * Sign-in on a device: opens the wrap with the password just typed — the one moment this device holds it — and keeps
 * the key. A wrap made under older parameters still opens; the next password change re-wraps it under current ones.
 */
export async function unwrapPrivacyKey(password: string, wrapped: WrappedPrivacyKey): Promise<void> {
  await ready;
  await storeKey(await openWrap(password, wrapped));
}

/** Opens a wrap and returns the key. Private: callers outside this file get wraps, never the key. */
async function openWrap(password: string, wrapped: WrappedPrivacyKey): Promise<Uint8Array> {
  const kdf = parseKdf(wrapped.kdf);
  const blob = decode(wrapped.wrappedKey);
  const salt = decode(wrapped.salt);
  if (kdf === null || blob === null || salt === null || blob.length !== WRAPPED_KEY_BYTES || salt.length !== SALT_BYTES) {
    throw new PrivacyKeyError('unreadable');
  }
  const wrappingKey = await derive(password, salt, kdf);
  try {
    return crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      blob.subarray(NONCE_BYTES),
      WRAP_CONTEXT,
      blob.subarray(0, NONCE_BYTES),
      wrappingKey,
    );
  } catch {
    throw new PrivacyKeyError('wrong_password');
  }
}

/** A password change: the same key, wrapped under the new password. Zones are not re-encrypted (ADR-007). */
export async function rewrapPrivacyKey(newPassword: string): Promise<WrappedPrivacyKey> {
  await ready;
  const key = await readKey();
  if (key === null) {
    throw new PrivacyKeyError('missing');
  }
  return wrap(key, newPassword, WRAPPING_KDF);
}

export async function hasPrivacyKey(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PRIVACY_KEY_STORAGE)) !== null;
}

/** Sign-out: the key leaves this device. The next sign-in unwraps it again. */
export async function forgetPrivacyKey(): Promise<void> {
  await SecureStore.deleteItemAsync(PRIVACY_KEY_STORAGE);
}

/** One assertion made by the lifecycle probe below. */
export interface PrivacyKeyProbeStep {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface PrivacyKeyProbe {
  readonly steps: readonly PrivacyKeyProbeStep[];
  /** One wrap at the current parameters — a derivation plus negligible AEAD (task 003's note). */
  readonly deriveMs: number;
  readonly totalMs: number;
  /** Exactly what `src/account` sends the server, so it can be read on screen and inspected. */
  readonly payload: WrappedPrivacyKey;
}

/** Parameters no build uses any more, to prove a wrap made under older ones still opens. */
const SUPERSEDED_KDF: WrappingKdf = { memoryKib: 32_768, iterations: 2, parallelism: 1 };

/**
 * Task 017's on-device privacy-key checks, for the debug-only diagnostics screen: the criteria from
 * task 003 that only a phone and real libsodium can settle.
 *
 * It runs entirely on a throwaway key of its own and **never touches secure storage or the signed-in
 * user's key** — the alternative, driving the public API, would store whatever it unwrapped and
 * destroy a real key. It lives here rather than in `crypto/diagnostics.ts` because only this module
 * can open a wrap without handing the key bytes to a caller, which is the property the whole file
 * exists to hold.
 */
export async function probePrivacyKeyLifecycle(): Promise<PrivacyKeyProbe> {
  await ready;
  const startedAt = Date.now();
  const steps: PrivacyKeyProbeStep[] = [];
  const record = (name: string, ok: boolean, detail: string) => steps.push({ name, ok, detail });

  const password = 'diagnostic password one';
  const newPassword = 'diagnostic password two';
  const key = randombytes_buf(KEY_BYTES);

  const wrapStartedAt = Date.now();
  const wrapped = await wrap(key, password, WRAPPING_KDF);
  const deriveMs = Date.now() - wrapStartedAt;

  // A new device holds nothing but the wrap the server kept and the password just typed.
  try {
    record(
      'A key wrapped on device A opens on device B',
      sameBytes(await openWrap(password, wrapped), key),
      'the wrap is self-contained: its salt and parameters travel with it',
    );
  } catch (error) {
    record('A key wrapped on device A opens on device B', false, String(error));
  }

  try {
    await openWrap('not the password', wrapped);
    record('The wrong password is refused', false, 'it opened — this is a failure');
  } catch (error) {
    const refused = error instanceof PrivacyKeyError && error.reason === 'wrong_password';
    record('The wrong password is refused', refused, refused ? 'wrong_password' : String(error));
  }

  // "The server never receives it in the clear" — what goes over the wire, checked and then shown.
  const fields = Object.keys(wrapped).sort().join(', ');
  const keyBase64 = encode(key);
  const second = await wrap(key, password, WRAPPING_KDF);
  record(
    'The wrap carries no key material',
    fields === 'kdf, salt, wrappedKey' &&
      !Object.values(wrapped).some((value) => value.includes(keyBase64)) &&
      second.wrappedKey !== wrapped.wrappedKey,
    `fields: ${fields}; the key does not appear in any of them; two wraps of one key differ`,
  );

  // A password change re-wraps the same key; a reset generates a new one (ADR-007).
  try {
    const rewrapped = await wrap(key, newPassword, WRAPPING_KDF);
    const sameKey = sameBytes(await openWrap(newPassword, rewrapped), key);
    let oldRefused = false;
    try {
      await openWrap(password, rewrapped);
    } catch {
      oldRefused = true;
    }
    record(
      'A password change keeps the key, so existing rows stay decryptable',
      sameKey && oldRefused,
      'the same key under the new password; the old password no longer opens it',
    );
  } catch (error) {
    record('A password change keeps the key, so existing rows stay decryptable', false, String(error));
  }

  record(
    'A password reset makes a new key, so existing rows do not survive',
    !sameBytes(randombytes_buf(KEY_BYTES), key),
    'reset generates a fresh key: rows under the old one cannot be recovered, and the reset screen says so first',
  );

  // A wrap made under parameters this build no longer uses must still open, and the next change
  // must re-wrap under the current ones.
  try {
    const superseded = await wrap(key, password, SUPERSEDED_KDF);
    const opened = sameBytes(await openWrap(password, superseded), key);
    const current = await wrap(key, newPassword, WRAPPING_KDF);
    record(
      'privacy_key_kdf travels with every wrap; older parameters still open',
      opened && superseded.kdf === formatKdf(SUPERSEDED_KDF) && current.kdf === formatKdf(WRAPPING_KDF),
      `opened ${superseded.kdf}; re-wrapped under ${current.kdf}`,
    );
  } catch (error) {
    record('privacy_key_kdf travels with every wrap; older parameters still open', false, String(error));
  }

  return { steps, deriveMs, totalMs: Date.now() - startedAt, payload: wrapped };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

async function wrap(key: Uint8Array, password: string, kdf: WrappingKdf): Promise<WrappedPrivacyKey> {
  const salt = randombytes_buf(SALT_BYTES);
  const wrappingKey = await derive(password, salt, kdf);
  const nonce = randombytes_buf(NONCE_BYTES);
  const sealed = crypto_aead_xchacha20poly1305_ietf_encrypt(key, WRAP_CONTEXT, null, nonce, wrappingKey);
  const blob = new Uint8Array(WRAPPED_KEY_BYTES);
  blob.set(nonce, 0);
  blob.set(sealed, NONCE_BYTES);
  return { wrappedKey: encode(blob), salt: encode(salt), kdf: formatKdf(kdf) };
}

async function derive(password: string, salt: Uint8Array, kdf: WrappingKdf): Promise<Uint8Array> {
  // A derivation holds the JavaScript thread while it runs: measured at **177 ms** on a Galaxy S21 FE (task 017's
  // device probe), not the "about a second" this comment previously asserted without ever having been timed. A
  // slower phone will take longer, and the yield stays for that reason — it lets the screen show that the app is
  // working before the thread is taken; the spinner itself animates on the native thread.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return crypto_pwhash(KEY_BYTES, password, salt, kdf.iterations, kdf.memoryKib * 1024, ARGON2ID13);
}

async function storeKey(key: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(PRIVACY_KEY_STORAGE, encode(key), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function readKey(): Promise<Uint8Array | null> {
  const stored = await SecureStore.getItemAsync(PRIVACY_KEY_STORAGE);
  const key = stored === null ? null : decode(stored);
  return key !== null && key.length === KEY_BYTES ? key : null;
}

function encode(bytes: Uint8Array): string {
  return to_base64(bytes, base64_variants.ORIGINAL);
}

function decode(text: string): Uint8Array | null {
  try {
    return from_base64(text, base64_variants.ORIGINAL);
  } catch {
    return null;
  }
}
