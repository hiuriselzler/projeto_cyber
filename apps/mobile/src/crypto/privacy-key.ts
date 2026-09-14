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
  const kdf = parseKdf(wrapped.kdf);
  const blob = decode(wrapped.wrappedKey);
  const salt = decode(wrapped.salt);
  if (kdf === null || blob === null || salt === null || blob.length !== WRAPPED_KEY_BYTES || salt.length !== SALT_BYTES) {
    throw new PrivacyKeyError('unreadable');
  }
  const wrappingKey = await derive(password, salt, kdf);
  let key: Uint8Array;
  try {
    key = crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      blob.subarray(NONCE_BYTES),
      WRAP_CONTEXT,
      blob.subarray(0, NONCE_BYTES),
      wrappingKey,
    );
  } catch {
    throw new PrivacyKeyError('wrong_password');
  }
  await storeKey(key);
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
  // A derivation holds the JavaScript thread for about a second on a mid-range phone (ADR-007). Yielding first lets
  // the screen show that the app is working before it does; the spinner itself animates on the native thread.
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
