/**
 * The session client: the access token in memory only, single-flight refresh, offline is not signed out (04 §3,
 * task 003).
 */
import { ApiUnreachableError, type ApiClient, type ApiRequest, type ApiResponse } from '../api-client';
import { REFRESH_PATH, SessionClient, SessionEndedError, type SessionTokens } from '../session-client';
import type { SessionStore, StoredSession } from '../session-store';

jest.mock('@/crypto', () => ({ randomDeviceId: async () => 'device-under-test' }));

const NOW = Date.parse('2026-09-14T12:00:00Z');
const MINUTE = 60_000;

function iso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

class MemoryStore implements SessionStore {
  session: StoredSession | null = null;
  readonly written: StoredSession[] = [];
  async read() {
    return this.session;
  }
  async write(session: StoredSession) {
    this.written.push(session);
    this.session = session;
  }
  async clear() {
    this.session = null;
  }
  async deviceId() {
    return 'device-under-test';
  }
}

const FIRST: SessionTokens = {
  accessToken: 'access-1',
  accessExpiresAt: NOW + 15 * MINUTE,
  refreshToken: 'refresh-1',
  refreshExpiresAt: NOW + 60 * 24 * 60 * MINUTE,
};

function refreshed(n: number): ApiResponse {
  return {
    status: 200,
    body: JSON.stringify({
      access_token: `access-${n}`,
      access_expires_at: iso(NOW + 15 * MINUTE),
      refresh_token: `refresh-${n}`,
      refresh_expires_at: iso(NOW + 60 * 24 * 60 * MINUTE),
    }),
  };
}

/** An API that rejects every access token but the newest, and rotates on each refresh. */
function fakeApi(onRefresh: (request: ApiRequest) => Promise<ApiResponse> | ApiResponse) {
  const log: ApiRequest[] = [];
  let current = 'access-1';
  const api: ApiClient = {
    baseUrl: 'https://api.test',
    get: (path) => api.send({ method: 'GET', path }),
    async send(request) {
      log.push(request);
      if (request.path === REFRESH_PATH) {
        const response = await onRefresh(request);
        if (response.status === 200) {
          current = (JSON.parse(response.body) as { access_token: string }).access_token;
        }
        return response;
      }
      return request.accessToken === current ? { status: 200, body: '{}' } : { status: 401, body: '{}' };
    },
  };
  return { api, log, expire: () => (current = 'nobody-has-this-token') };
}

describe('the session client', () => {
  it('turns ten requests that meet a 401 into exactly one refresh', async () => {
    const store = new MemoryStore();
    const refreshes = { count: 0 };
    const { api, log, expire } = fakeApi(async () => {
      refreshes.count += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return refreshed(2);
    });
    const client = new SessionClient(api, store, () => NOW);
    await client.begin('user-1', FIRST);
    expire();

    const responses = await Promise.all(Array.from({ length: 10 }, () => client.request({ method: 'GET', path: '/api/v1/auth/me' })));

    expect(responses.map((response) => response.status)).toEqual(Array(10).fill(200));
    expect(refreshes.count).toBe(1);
    expect(log.filter((request) => request.path === REFRESH_PATH)).toHaveLength(1);
  });

  it('never writes an access token to storage', async () => {
    const store = new MemoryStore();
    const { api, expire } = fakeApi(() => refreshed(2));
    const client = new SessionClient(api, store, () => NOW);
    await client.begin('user-1', FIRST);
    expire();

    await client.request({ method: 'GET', path: '/api/v1/auth/me' });

    const stored = JSON.stringify(store.written);
    expect(stored).not.toContain('access-');
    expect(store.written.map((session) => session.refreshToken)).toEqual(['refresh-1', 'refresh-2']);
  });

  it('keeps the rotated refresh token before it uses the new access token', async () => {
    const store = new MemoryStore();
    const events: string[] = [];
    const { api, expire } = fakeApi(() => refreshed(2));
    const send = api.send.bind(api);
    api.send = async (request) => {
      events.push(request.path === REFRESH_PATH ? 'refresh' : `request with ${request.accessToken}`);
      return send(request);
    };
    const write = store.write.bind(store);
    store.write = async (session) => {
      events.push(`stored ${session.refreshToken}`);
      return write(session);
    };
    const client = new SessionClient(api, store, () => NOW);
    await client.begin('user-1', FIRST);
    expire();

    await client.request({ method: 'GET', path: '/api/v1/auth/me' });

    expect(events).toEqual(['stored refresh-1', 'request with access-1', 'refresh', 'stored refresh-2', 'request with access-2']);
  });

  it('refreshes before a request when the access token is about to expire', async () => {
    const store = new MemoryStore();
    const { api, log } = fakeApi(() => refreshed(2));
    let now = NOW;
    const client = new SessionClient(api, store, () => now);
    await client.begin('user-1', FIRST);

    now = FIRST.accessExpiresAt - 10_000;
    await client.request({ method: 'GET', path: '/api/v1/auth/me' });

    expect(log.map((request) => request.path)).toEqual([REFRESH_PATH, '/api/v1/auth/me']);
  });

  it('ends the session when the server refuses the refresh token', async () => {
    const store = new MemoryStore();
    const { api, expire } = fakeApi(() => ({ status: 401, body: '{"error":"refresh_rejected"}' }));
    const client = new SessionClient(api, store, () => NOW);
    const ended = jest.fn();
    client.onEnded(ended);
    await client.begin('user-1', FIRST);
    expire();

    await expect(client.request({ method: 'GET', path: '/api/v1/auth/me' })).rejects.toBeInstanceOf(SessionEndedError);

    expect(store.session).toBeNull();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('stays signed in when the API cannot be reached', async () => {
    const store = new MemoryStore();
    const { api, expire } = fakeApi(() => {
      throw new ApiUnreachableError();
    });
    const client = new SessionClient(api, store, () => NOW);
    const ended = jest.fn();
    client.onEnded(ended);
    await client.begin('user-1', FIRST);
    expire();

    await expect(client.request({ method: 'GET', path: '/api/v1/auth/me' })).rejects.toBeInstanceOf(ApiUnreachableError);

    expect(store.session?.refreshToken).toBe('refresh-1');
    expect(ended).not.toHaveBeenCalled();
  });
});
