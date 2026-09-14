/**
 * Authenticated requests, and the refresh behind them (04 §3, ADR-015, task 003).
 *
 * - The access token lives in this object's memory and nowhere else — never SQLite, never storage.
 * - A request that meets a 401 refreshes once and retries once. Refreshes are single-flight: ten requests that meet
 *   the same stale token share one refresh, because a second refresh would present a replaced token and look like
 *   theft to the server.
 * - The rotated refresh token reaches secure storage before the new access token is used.
 * - Offline is not signed out: a refresh that cannot reach the API leaves the session exactly as it was (NFR-1).
 */
import { ApiUnreachableError, type ApiClient, type ApiRequest, type ApiResponse } from './api-client';
import type { SessionStore } from './session-store';

/** A refresh within this margin of expiry happens before the request, rather than after a 401. */
const EXPIRY_MARGIN_MS = 30_000;

export const REFRESH_PATH = '/api/v1/auth/refresh';

export interface SessionTokens {
  readonly accessToken: string;
  /** Epoch milliseconds. */
  readonly accessExpiresAt: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: number;
}

/** The server refused the refresh token, or it expired: the session is over and has been cleared. */
export class SessionEndedError extends Error {
  constructor() {
    super('the session has ended');
    this.name = 'SessionEndedError';
  }
}

interface TokensBody {
  readonly access_token: string;
  readonly access_expires_at: string;
  readonly refresh_token: string;
  readonly refresh_expires_at: string;
}

/** Tokens from any response that carries them: registration, sign-in and refresh alike. */
export function tokensFromBody(body: TokensBody): SessionTokens {
  return {
    accessToken: body.access_token,
    accessExpiresAt: Date.parse(body.access_expires_at),
    refreshToken: body.refresh_token,
    refreshExpiresAt: Date.parse(body.refresh_expires_at),
  };
}

export class SessionClient {
  private access: { readonly token: string; readonly expiresAt: number } | null = null;
  private refreshing: Promise<void> | null = null;
  private readonly endedListeners = new Set<() => void>();

  constructor(
    private readonly api: ApiClient,
    private readonly store: SessionStore,
    private readonly now: () => number = Date.now,
  ) {}

  /** After registration or sign-in. */
  async begin(userId: string, tokens: SessionTokens): Promise<void> {
    await this.store.write({ userId, refreshToken: tokens.refreshToken, refreshExpiresAt: tokens.refreshExpiresAt });
    this.access = { token: tokens.accessToken, expiresAt: tokens.accessExpiresAt };
  }

  /** Forgets the session on this device. Telling the server is the caller's business. */
  async end(): Promise<void> {
    this.access = null;
    await this.store.clear();
  }

  /** Called when the server ends the session — a revoked device, a reset password. */
  onEnded(listener: () => void): () => void {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  }

  async request(request: Omit<ApiRequest, 'accessToken'>): Promise<ApiResponse> {
    const token = await this.usableAccessToken();
    const response = await this.api.send({ ...request, accessToken: token });
    if (response.status !== 401) {
      return response;
    }
    await this.refreshOnce(token);
    return this.api.send({ ...request, accessToken: await this.usableAccessToken() });
  }

  private fresh(): boolean {
    return this.access !== null && this.access.expiresAt - EXPIRY_MARGIN_MS > this.now();
  }

  private async usableAccessToken(): Promise<string> {
    if (!this.fresh()) {
      await this.refreshOnce(this.access?.token ?? null);
    }
    if (this.access === null) {
      throw new SessionEndedError();
    }
    return this.access.token;
  }

  /** One refresh for everyone who saw `stale`; nothing at all if a newer token has already arrived. */
  private refreshOnce(stale: string | null): Promise<void> {
    if (this.fresh() && this.access?.token !== stale) {
      return Promise.resolve();
    }
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refresh(): Promise<void> {
    const stored = await this.store.read();
    if (stored === null || stored.refreshExpiresAt <= this.now()) {
      return this.sessionEnded();
    }
    let response: ApiResponse;
    try {
      response = await this.api.send({ method: 'POST', path: REFRESH_PATH, body: { refresh_token: stored.refreshToken } });
    } catch (error) {
      throw error instanceof ApiUnreachableError ? error : new ApiUnreachableError();
    }
    if (response.status === 401) {
      return this.sessionEnded();
    }
    if (response.status !== 200) {
      throw new ApiUnreachableError();
    }
    const tokens = tokensFromBody(JSON.parse(response.body) as TokensBody);
    await this.store.write({ ...stored, refreshToken: tokens.refreshToken, refreshExpiresAt: tokens.refreshExpiresAt });
    this.access = { token: tokens.accessToken, expiresAt: tokens.accessExpiresAt };
  }

  private async sessionEnded(): Promise<never> {
    await this.end();
    for (const listener of this.endedListeners) {
      listener();
    }
    throw new SessionEndedError();
  }
}
