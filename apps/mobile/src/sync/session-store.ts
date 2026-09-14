/**
 * What survives a restart of a signed-in session: the refresh token and when it expires, in secure storage (04 §3).
 * The access token is never here — it lives in the session client's memory only.
 */
import * as SecureStore from 'expo-secure-store';

import { randomDeviceId } from '@/crypto';

const SESSION_STORAGE = 'cyberathlete.session';
const DEVICE_ID_STORAGE = 'cyberathlete.device-id';

export interface StoredSession {
  readonly userId: string;
  readonly refreshToken: string;
  /** Epoch milliseconds. Past it, the session is over even offline. */
  readonly refreshExpiresAt: number;
}

export interface SessionStore {
  read(): Promise<StoredSession | null>;
  write(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
  /** This install's device id: generated once, kept across sign-outs, sent with every sign-in (04 §3). */
  deviceId(): Promise<string>;
}

const SECURE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

function isStoredSession(value: unknown): value is StoredSession {
  const candidate = value as Partial<StoredSession> | null;
  return (
    typeof candidate?.userId === 'string' &&
    typeof candidate.refreshToken === 'string' &&
    typeof candidate.refreshExpiresAt === 'number'
  );
}

export const secureSessionStore: SessionStore = {
  async read() {
    const stored = await SecureStore.getItemAsync(SESSION_STORAGE);
    if (stored === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(stored);
      return isStoredSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  async write(session) {
    await SecureStore.setItemAsync(SESSION_STORAGE, JSON.stringify(session), SECURE_OPTIONS);
  },
  async clear() {
    await SecureStore.deleteItemAsync(SESSION_STORAGE);
  },
  async deviceId() {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_STORAGE);
    if (existing !== null) {
      return existing;
    }
    const created = await randomDeviceId();
    await SecureStore.setItemAsync(DEVICE_ID_STORAGE, created, SECURE_OPTIONS);
    return created;
  },
};
