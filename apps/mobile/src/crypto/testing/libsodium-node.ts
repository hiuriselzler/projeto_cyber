/**
 * Jest only. react-native-libsodium's functions over libsodium's own JavaScript build, so the privacy-key tests run
 * real argon2id and XChaCha20-Poly1305 instead of a mock (task 003). jest.config.js maps the native module here;
 * nothing in the app imports this file. Whether the native binding behaves the same on a phone is task 017's check.
 *
 * libsodium-wrappers only fills in its functions once `ready` resolves, so each export looks its function up at call
 * time. `base64_variants` holds libsodium's own enum values.
 */
import sodium from 'libsodium-wrappers-sumo';

const lib: typeof sodium = sodium;

export const ready: Promise<void> = lib.ready;

export const base64_variants = { ORIGINAL: 1, ORIGINAL_NO_PADDING: 3, URLSAFE: 5, URLSAFE_NO_PADDING: 7 } as const;

export function crypto_pwhash(
  keyLength: number,
  password: string | Uint8Array,
  salt: Uint8Array,
  opsLimit: number,
  memLimit: number,
  algorithm: number,
): Uint8Array {
  return lib.crypto_pwhash(keyLength, password, salt, opsLimit, memLimit, algorithm);
}

export function crypto_aead_xchacha20poly1305_ietf_encrypt(
  message: string | Uint8Array,
  additionalData: string | Uint8Array | null,
  secretNonce: Uint8Array | null,
  publicNonce: Uint8Array,
  key: Uint8Array,
): Uint8Array {
  return lib.crypto_aead_xchacha20poly1305_ietf_encrypt(message, additionalData, secretNonce, publicNonce, key);
}

export function crypto_aead_xchacha20poly1305_ietf_decrypt(
  secretNonce: Uint8Array | null,
  ciphertext: Uint8Array,
  additionalData: string | Uint8Array | null,
  publicNonce: Uint8Array,
  key: Uint8Array,
): Uint8Array {
  return lib.crypto_aead_xchacha20poly1305_ietf_decrypt(secretNonce, ciphertext, additionalData, publicNonce, key);
}

export function randombytes_buf(length: number): Uint8Array {
  return lib.randombytes_buf(length);
}

export function to_base64(input: string | Uint8Array, variant: number): string {
  return lib.to_base64(input, variant);
}

export function from_base64(input: string, variant: number): Uint8Array {
  return lib.from_base64(input, variant);
}

export function to_hex(input: string | Uint8Array): string {
  return lib.to_hex(input);
}

/** For the test that holds privacy-key.ts's fixed sizes to libsodium's own. */
export function libsodiumConstants() {
  return {
    ARGON2ID13: lib.crypto_pwhash_ALG_ARGON2ID13,
    SALT_BYTES: lib.crypto_pwhash_SALTBYTES,
    NONCE_BYTES: lib.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    KEY_BYTES: lib.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
    TAG_BYTES: lib.crypto_aead_xchacha20poly1305_ietf_ABYTES,
  };
}
