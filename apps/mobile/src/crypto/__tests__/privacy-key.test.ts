/**
 * The privacy key's lifecycle (ADR-007, task 003), with libsodium's real argon2id and XChaCha20-Poly1305 — see
 * src/crypto/testing/libsodium-node.ts. Secure storage is an in-memory map.
 */
import { from_base64, ready } from 'react-native-libsodium';

import { libsodiumConstants } from '../testing/libsodium-node';
import {
  forgetPrivacyKey,
  hasPrivacyKey,
  prepareNewPrivacyKey,
  PrivacyKeyError,
  rewrapPrivacyKey,
  unwrapPrivacyKey,
  WRAPPED_KEY_BYTES,
} from '../privacy-key';

const mockSecureStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: async (key: string) => mockSecureStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockSecureStore.delete(key);
  },
}));

const STORAGE = 'cyberathlete.privacy-key';
const PASSWORD = 'plum-orbit-quarry-7412';
const NEW_PASSWORD = 'lantern-fjord-mosaic-3091';
const ORIGINAL = 1;

// Each derivation is argon2id at 64 MiB in JavaScript.
jest.setTimeout(120_000);

describe('the privacy key (ADR-007)', () => {
  beforeEach(() => mockSecureStore.clear());

  it('uses libsodium’s own sizes', async () => {
    await ready;
    expect(libsodiumConstants()).toEqual({ ARGON2ID13: 2, SALT_BYTES: 16, NONCE_BYTES: 24, KEY_BYTES: 32, TAG_BYTES: 16 });
  });

  it('wraps a new key as the API expects, and keeps it only once committed', async () => {
    const prepared = await prepareNewPrivacyKey(PASSWORD);

    expect(from_base64(prepared.wrapped.wrappedKey, ORIGINAL)).toHaveLength(WRAPPED_KEY_BYTES);
    expect(from_base64(prepared.wrapped.salt, ORIGINAL)).toHaveLength(16);
    expect(prepared.wrapped.kdf).toBe('argon2id$m=65536,t=3,p=1');
    expect(await hasPrivacyKey()).toBe(false);

    await prepared.commit();
    expect(await hasPrivacyKey()).toBe(true);
  });

  it('never puts the key itself in the wrap the server receives', async () => {
    const prepared = await prepareNewPrivacyKey(PASSWORD);
    await prepared.commit();
    const key = mockSecureStore.get(STORAGE) ?? '';

    expect(JSON.stringify(prepared.wrapped)).not.toContain(key);
    const blob = from_base64(prepared.wrapped.wrappedKey, ORIGINAL);
    const raw = from_base64(key, ORIGINAL);
    const containsKey = blob.some(
      (_, start) => start + raw.length <= blob.length && raw.every((byte, index) => blob[start + index] === byte),
    );
    expect(containsKey).toBe(false);
  });

  it('opens on another device with the password it was wrapped under — the same key', async () => {
    const prepared = await prepareNewPrivacyKey(PASSWORD);
    await prepared.commit();
    const original = mockSecureStore.get(STORAGE);

    await forgetPrivacyKey();
    await unwrapPrivacyKey(PASSWORD, prepared.wrapped);

    expect(mockSecureStore.get(STORAGE)).toBe(original);
  });

  it('refuses the wrong password and keeps nothing', async () => {
    const prepared = await prepareNewPrivacyKey(PASSWORD);

    await expect(unwrapPrivacyKey(NEW_PASSWORD, prepared.wrapped)).rejects.toEqual(new PrivacyKeyError('wrong_password'));
    expect(await hasPrivacyKey()).toBe(false);
  });

  it('re-wraps the same key under a new password, which the old one no longer opens', async () => {
    const prepared = await prepareNewPrivacyKey(PASSWORD);
    await prepared.commit();
    const original = mockSecureStore.get(STORAGE);

    const rewrapped = await rewrapPrivacyKey(NEW_PASSWORD);
    await forgetPrivacyKey();

    await expect(unwrapPrivacyKey(PASSWORD, rewrapped)).rejects.toBeInstanceOf(PrivacyKeyError);
    await unwrapPrivacyKey(NEW_PASSWORD, rewrapped);
    expect(mockSecureStore.get(STORAGE)).toBe(original);
  });

  it('cannot re-wrap a key this device does not hold', async () => {
    await expect(rewrapPrivacyKey(NEW_PASSWORD)).rejects.toEqual(new PrivacyKeyError('missing'));
  });

  it('refuses a wrap it cannot read', async () => {
    const prepared = await prepareNewPrivacyKey(PASSWORD);

    await expect(unwrapPrivacyKey(PASSWORD, { ...prepared.wrapped, kdf: 'argon2id$m=65536,t=3,p=4' })).rejects.toEqual(
      new PrivacyKeyError('unreadable'),
    );
  });
});
