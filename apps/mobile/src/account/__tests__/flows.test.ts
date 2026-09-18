/**
 * The account flows against fakes (tasks 003 and 019): offline sign-in, the privacy key at registration, sign-in,
 * password change and reset, sign-out, and deleting the account. The session client and the key are the real
 * behaviour's seams, each tested on its own in src/sync and src/crypto.
 */
import type { PreparedPrivacyKey, WrappedPrivacyKey } from '@/crypto';
import type { LocalAccount } from '@/db/account';
import type { ApiClient, ApiRequest, ApiResponse, SessionClient, SessionStore, StoredSession } from '@/sync';

import { AccountError } from '../errors';
import {
  cancelAccountDeletion,
  changePassword,
  confirmPasswordReset,
  forgetEndedSession,
  register,
  requestAccountDeletion,
  restoreSession,
  signIn,
  signOut,
} from '../flows';
import type { AccountServices } from '../services';
import { getSessionState, setSessionState } from '../session';

const NOW = Date.parse('2026-09-14T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = 'plum-orbit-quarry-7412';

const ACCOUNT: LocalAccount = {
  id: '0192f0c4-0000-7000-8000-000000000001',
  email: 'ana@example.com',
  emailVerified: false,
  displayName: 'Ana',
  unitSystem: 'metric',
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  deletionRequestedAt: null,
};

const WRAP: WrappedPrivacyKey = { wrappedKey: 'd3JhcA==', salt: 'c2FsdA==', kdf: 'argon2id$m=65536,t=3,p=1' };

function accountBody() {
  return {
    id: ACCOUNT.id,
    email: ACCOUNT.email,
    email_verified: false,
    display_name: 'Ana',
    unit_system: 'metric',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    birth_date: null,
    sex: null,
    max_hr: null,
    resting_hr: null,
    gamification_enabled: true,
    privacy_key: { wrapped_key: WRAP.wrappedKey, salt: WRAP.salt, kdf: WRAP.kdf },
    deletion_requested_at: null,
  };
}

function signedInResponse(status: number): ApiResponse {
  return {
    status,
    body: JSON.stringify({
      token_type: 'bearer',
      access_token: 'access',
      access_expires_at: '2026-09-14T12:15:00Z',
      refresh_token: 'refresh',
      refresh_expires_at: '2026-11-13T12:00:00Z',
      account: accountBody(),
    }),
  };
}

interface Fakes {
  services: AccountServices;
  sent: ApiRequest[];
  events: string[];
  stored: { session: StoredSession | null };
  saved: LocalAccount[];
}

function fakes(respond: (request: ApiRequest) => ApiResponse, options: { offline?: boolean } = {}): Fakes {
  const sent: ApiRequest[] = [];
  const events: string[] = [];
  const saved: LocalAccount[] = [];
  const stored: { session: StoredSession | null } = { session: null };

  const api: ApiClient = {
    baseUrl: 'https://api.test',
    get: async () => ({ status: 200, body: '{}' }),
    async send(request) {
      sent.push(request);
      if (options.offline) {
        throw new Error('offline');
      }
      return respond(request);
    },
  };
  const store: SessionStore = {
    read: async () => stored.session,
    write: async (session) => {
      stored.session = session;
    },
    clear: async () => {
      stored.session = null;
      events.push('session cleared');
    },
    deviceId: async () => 'device-0123456789abcdef',
  };
  const session = {
    begin: async (userId: string) => {
      events.push(`session began for ${userId}`);
      stored.session = { userId, refreshToken: 'refresh', refreshExpiresAt: NOW + 60 * DAY };
    },
    end: async () => {
      events.push('session ended');
      stored.session = null;
    },
    request: async (request: Omit<ApiRequest, 'accessToken'>) => api.send(request),
    onEnded: () => () => undefined,
  } as unknown as SessionClient;

  const services: AccountServices = {
    api,
    session,
    store,
    accounts: {
      save: (account) => {
        saved.push(account);
      },
      read: (id) => saved.find((account) => account.id === id) ?? null,
      forget: (id) => {
        events.push('account forgotten');
        saved.splice(0, saved.length, ...saved.filter((account) => account.id !== id));
      },
    },
    keys: {
      prepareNew: async (password): Promise<PreparedPrivacyKey> => {
        events.push(`key prepared under ${password === PASSWORD ? 'the password' : 'another password'}`);
        return {
          wrapped: WRAP,
          commit: async () => {
            events.push('key kept');
          },
        };
      },
      unwrap: async (password) => {
        events.push(`key unwrapped with ${password === PASSWORD ? 'the password' : 'another password'}`);
      },
      rewrap: async () => {
        events.push('key re-wrapped');
        return WRAP;
      },
      forget: async () => {
        events.push('key forgotten');
      },
    },
    newId: async () => ACCOUNT.id,
    now: () => NOW,
    timeZone: () => 'America/Sao_Paulo',
  };
  return { services, sent, events, stored, saved };
}

describe('the account flows', () => {
  beforeEach(() => setSessionState({ status: 'restoring' }));

  describe('launch', () => {
    it('signs a returning user in with no network at all', async () => {
      const { services, sent, stored, saved } = fakes(() => signedInResponse(200), { offline: true });
      stored.session = { userId: ACCOUNT.id, refreshToken: 'refresh', refreshExpiresAt: NOW + DAY };
      saved.push(ACCOUNT);

      const state = await restoreSession(services);

      expect(state).toEqual({ status: 'signed-in', account: ACCOUNT });
      expect(sent).toEqual([]);
    });

    it('treats an expired refresh token as signed out, and forgets it', async () => {
      const { services, stored, saved, events } = fakes(() => signedInResponse(200));
      stored.session = { userId: ACCOUNT.id, refreshToken: 'refresh', refreshExpiresAt: NOW - 1 };
      saved.push(ACCOUNT);

      expect(await restoreSession(services)).toEqual({ status: 'signed-out' });
      expect(events).toContain('session ended');
    });

    it('is signed out on a first launch', async () => {
      const { services } = fakes(() => signedInResponse(200));

      expect(await restoreSession(services)).toEqual({ status: 'signed-out' });
    });
  });

  describe('registration', () => {
    it('sends only the wrap of a new key, and keeps the key once the account exists', async () => {
      const { services, sent, events } = fakes(() => signedInResponse(201));

      const account = await register(services, {
        email: ACCOUNT.email,
        password: PASSWORD,
        displayName: 'Ana',
        locale: 'pt-BR',
        unitSystem: 'metric',
      });

      expect(account).toEqual(ACCOUNT);
      expect(sent[0].body).toMatchObject({
        id: ACCOUNT.id,
        device_id: 'device-0123456789abcdef',
        timezone: 'America/Sao_Paulo',
        privacy_key: { wrapped_key: WRAP.wrappedKey, salt: WRAP.salt, kdf: WRAP.kdf },
      });
      expect(events).toEqual(['key prepared under the password', 'key kept', `session began for ${ACCOUNT.id}`]);
      expect(getSessionState()).toEqual({ status: 'signed-in', account: ACCOUNT });
    });

    it('keeps no key when the server refuses the account', async () => {
      const { services, events } = fakes(() => ({ status: 409, body: '{"error":"email_unavailable"}' }));

      await expect(
        register(services, { email: ACCOUNT.email, password: PASSWORD, displayName: 'Ana', locale: 'en', unitSystem: 'metric' }),
      ).rejects.toEqual(new AccountError('email_unavailable'));
      expect(events).not.toContain('key kept');
    });
  });

  describe('sign-in', () => {
    it('opens the privacy key with the password just typed, before the session begins', async () => {
      const { services, events } = fakes(() => signedInResponse(200));

      await signIn(services, { email: ACCOUNT.email, password: PASSWORD });

      expect(events).toEqual(['key unwrapped with the password', `session began for ${ACCOUNT.id}`]);
    });

    it('says why a sign-in was refused, and that offline is offline', async () => {
      const refused = fakes(() => ({ status: 401, body: '{"error":"invalid_credentials"}' }));
      const limited = fakes(() => ({ status: 429, body: '{"error":"rate_limited"}' }));

      await expect(signIn(refused.services, { email: 'a@example.com', password: 'x' })).rejects.toEqual(
        new AccountError('invalid_credentials'),
      );
      await expect(signIn(limited.services, { email: 'a@example.com', password: 'x' })).rejects.toEqual(
        new AccountError('rate_limited'),
      );
    });
  });

  describe('passwords', () => {
    it('re-wraps the same key for a password change and stays signed in', async () => {
      const { services, sent, events } = fakes(() => ({ status: 204, body: '' }));
      setSessionState({ status: 'signed-in', account: ACCOUNT });

      await changePassword(services, { currentPassword: PASSWORD, newPassword: 'lantern-fjord-mosaic-3091' });

      expect(events).toEqual(['key re-wrapped']);
      expect(sent[0]).toMatchObject({ path: '/api/v1/auth/password/change' });
      expect(getSessionState().status).toBe('signed-in');
    });

    it('signs this device out after a reset, keeping no old key and no account row', async () => {
      const { services, events } = fakes(() => ({ status: 204, body: '' }));
      setSessionState({ status: 'signed-in', account: ACCOUNT });

      await confirmPasswordReset(services, { token: 'reset-token-0123456789', newPassword: PASSWORD });

      expect(events).toEqual(['key prepared under the password', 'session ended', 'key forgotten', 'account forgotten']);
      expect(getSessionState()).toEqual({ status: 'signed-out' });
    });
  });

  describe('deleting the account', () => {
    it('asks with the password, stays signed in, and keeps the pending deletion on the device', async () => {
      const { services, sent, saved } = fakes(() => ({
        status: 200,
        body: JSON.stringify({ deletion_requested_at: '2026-09-14T12:00:00Z', deleted_from: '2026-09-21T12:00:00Z' }),
      }));
      setSessionState({ status: 'signed-in', account: ACCOUNT });

      const account = await requestAccountDeletion(services, PASSWORD);

      expect(sent[0]).toMatchObject({ method: 'POST', path: '/api/v1/auth/deletion', body: { password: PASSWORD } });
      expect(account).toEqual({ ...ACCOUNT, deletionRequestedAt: NOW });
      expect(saved).toEqual([account]);
      expect(getSessionState()).toEqual({ status: 'signed-in', account });
    });

    it('says when the password is wrong, and changes nothing', async () => {
      const { services, saved } = fakes(() => ({ status: 403, body: '{"error":"password_incorrect"}' }));
      setSessionState({ status: 'signed-in', account: ACCOUNT });

      await expect(requestAccountDeletion(services, 'not the password')).rejects.toEqual(
        new AccountError('password_incorrect'),
      );
      expect(saved).toEqual([]);
      expect(getSessionState()).toEqual({ status: 'signed-in', account: ACCOUNT });
    });

    it('keeps the account when the deletion is cancelled', async () => {
      const { services, sent } = fakes(() => ({ status: 204, body: '' }));
      setSessionState({ status: 'signed-in', account: { ...ACCOUNT, deletionRequestedAt: NOW } });

      const account = await cancelAccountDeletion(services);

      expect(sent[0]).toMatchObject({ method: 'DELETE', path: '/api/v1/auth/deletion' });
      expect(account).toEqual(ACCOUNT);
      expect(getSessionState()).toEqual({ status: 'signed-in', account: ACCOUNT });
    });

    it('forgets the key and the account’s row when the server ends the session, as it does for a deleted account', async () => {
      const { services, events, saved } = fakes(() => ({ status: 204, body: '' }));
      saved.push(ACCOUNT);
      setSessionState({ status: 'signed-in', account: ACCOUNT });

      await forgetEndedSession(services);

      expect(events).toEqual(['key forgotten', 'account forgotten']);
      expect(saved).toEqual([]);
      expect(getSessionState()).toEqual({ status: 'signed-out' });
    });
  });

  it('signs out on this device even when the server cannot be told', async () => {
    const { services, events } = fakes(() => ({ status: 204, body: '' }), { offline: true });
    setSessionState({ status: 'signed-in', account: ACCOUNT });

    await signOut(services);

    expect(events).toEqual(['session ended', 'key forgotten', 'account forgotten']);
    expect(getSessionState()).toEqual({ status: 'signed-out' });
  });
});
