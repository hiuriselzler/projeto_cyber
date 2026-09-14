/**
 * The account flows (ADR-012, task 003): registration, sign-in, sign-out, passwords, email and sessions.
 *
 * This folder decides when the privacy key is generated, unwrapped or re-wrapped (ADR-007); `src/crypto` does it.
 * Passwords pass through here, so nothing in this folder logs anything.
 */
import type { components } from '@cyberathlete/shared/api';

import type { WrappedPrivacyKey } from '@/crypto';
import type { LocalAccount } from '@/db/account';
import { tokensFromBody, type ApiResponse } from '@/sync';

import { AccountError, accountErrorFrom, asAccountError } from './errors';
import type { AccountServices } from './services';
import { getSessionState, setSessionState, type SessionState } from './session';

type Schemas = components['schemas'];

const AUTH = '/api/v1/auth';

export interface Registration {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly locale: LocalAccount['locale'];
  readonly unitSystem: LocalAccount['unitSystem'];
}

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export interface DeviceSession {
  readonly id: string;
  readonly deviceName: string | null;
  readonly current: boolean;
}

export interface AccountChanges {
  readonly displayName?: string;
  readonly locale?: LocalAccount['locale'];
  readonly unitSystem?: LocalAccount['unitSystem'];
}

// --- launch -------------------------------------------------------------------------------------------------------

/**
 * At launch, from the device alone. A user whose refresh token has not expired is signed in with no network at all:
 * authentication is not on the path to using the app (NFR-1). Tokens refresh on the first request that needs them.
 */
export async function restoreSession(services: AccountServices): Promise<SessionState> {
  try {
    const stored = await services.store.read();
    const usable = stored !== null && stored.refreshExpiresAt > services.now();
    const account = usable ? services.accounts.read(stored.userId) : null;
    if (account === null) {
      if (stored !== null) {
        await services.session.end();
      }
      setSessionState({ status: 'signed-out' });
    } else {
      setSessionState({ status: 'signed-in', account });
    }
  } catch {
    setSessionState({ status: 'signed-out' });
  }
  return getSessionState();
}

// --- registration and sign-in -------------------------------------------------------------------------------------

export async function register(services: AccountServices, registration: Registration): Promise<LocalAccount> {
  try {
    const nowMs = services.now();
    // The key is made here and kept only once the server has its wrap (ADR-007).
    const [id, deviceId, key] = await Promise.all([
      services.newId(nowMs),
      services.store.deviceId(),
      services.keys.prepareNew(registration.password),
    ]);
    const response = await services.api.send({
      method: 'POST',
      path: `${AUTH}/register`,
      body: {
        id,
        email: registration.email,
        password: registration.password,
        display_name: registration.displayName,
        locale: registration.locale,
        unit_system: registration.unitSystem,
        timezone: services.timeZone(),
        device_id: deviceId,
        privacy_key: toWire(key.wrapped),
      },
    });
    const body = expect<Schemas['SignedInResponse']>(response, 201);
    await key.commit();
    await services.session.begin(body.account.id, tokensFromBody(body));
    return signedIn(services, body.account);
  } catch (error) {
    throw asAccountError(error);
  }
}

export async function signIn(services: AccountServices, credentials: Credentials): Promise<LocalAccount> {
  try {
    const response = await services.api.send({
      method: 'POST',
      path: `${AUTH}/login`,
      body: { email: credentials.email, password: credentials.password, device_id: await services.store.deviceId() },
    });
    const body = expect<Schemas['SignedInResponse']>(response, 200);
    const wrapped = body.account.privacy_key;
    if (wrapped) {
      // The one moment this device holds the password: open the key now, or it cannot be opened here (ADR-007). A
      // wrap that will not open does not stop the sign-in — training never waits on the privacy key.
      await services.keys.unwrap(credentials.password, fromWire(wrapped)).catch(() => undefined);
    }
    await services.session.begin(body.account.id, tokensFromBody(body));
    return signedIn(services, body.account);
  } catch (error) {
    throw asAccountError(error);
  }
}

/** This device only. Offline, it signs out all the same; the server's token expires on its own. */
export async function signOut(services: AccountServices): Promise<void> {
  try {
    await services.session.request({ method: 'POST', path: `${AUTH}/logout` });
  } catch {
    // Offline, or the server had already ended the session.
  }
  await endHere(services);
}

export async function signOutEverywhere(services: AccountServices): Promise<void> {
  try {
    expectStatus(await services.session.request({ method: 'POST', path: `${AUTH}/logout-all` }), 204);
  } catch (error) {
    throw asAccountError(error);
  }
  await endHere(services);
}

// --- passwords --------------------------------------------------------------------------------------------------

/** Re-wraps the same privacy key under the new password; every other device stays signed in (04 §2a). */
export async function changePassword(
  services: AccountServices,
  change: { readonly currentPassword: string; readonly newPassword: string },
): Promise<void> {
  try {
    const wrapped = await services.keys.rewrap(change.newPassword);
    const response = await services.session.request({
      method: 'POST',
      path: `${AUTH}/password/change`,
      body: {
        current_password: change.currentPassword,
        new_password: change.newPassword,
        privacy_key: toWire(wrapped),
      },
    });
    expectStatus(response, 204);
  } catch (error) {
    throw asAccountError(error);
  }
}

export async function requestPasswordReset(services: AccountServices, email: string): Promise<void> {
  try {
    expectStatus(await services.api.send({ method: 'POST', path: `${AUTH}/password-reset/request`, body: { email } }), 202);
  } catch (error) {
    throw asAccountError(error);
  }
}

/**
 * The old key is gone with the old password, and so are the zones it opened (04 §2a); the screen has said so before
 * this is called. A new key is wrapped for the account, and every device — this one too — is signed out.
 */
export async function confirmPasswordReset(
  services: AccountServices,
  reset: { readonly token: string; readonly newPassword: string },
): Promise<void> {
  try {
    const key = await services.keys.prepareNew(reset.newPassword);
    const response = await services.api.send({
      method: 'POST',
      path: `${AUTH}/password-reset/confirm`,
      body: { token: reset.token, new_password: reset.newPassword, privacy_key: toWire(key.wrapped) },
    });
    expectStatus(response, 204);
  } catch (error) {
    throw asAccountError(error);
  }
  await endHere(services);
}

// --- email ----------------------------------------------------------------------------------------------------------

export async function verifyEmail(services: AccountServices, token: string): Promise<void> {
  try {
    expectStatus(await services.api.send({ method: 'POST', path: `${AUTH}/email/verify`, body: { token } }), 204);
  } catch (error) {
    throw asAccountError(error);
  }
  if (getSessionState().status === 'signed-in') {
    await refreshAccount(services).catch(() => undefined);
  }
}

export async function resendVerification(services: AccountServices): Promise<void> {
  try {
    expectStatus(await services.session.request({ method: 'POST', path: `${AUTH}/email/verification` }), 202);
  } catch (error) {
    throw asAccountError(error);
  }
}

export async function changeEmail(
  services: AccountServices,
  change: { readonly currentPassword: string; readonly newEmail: string },
): Promise<void> {
  try {
    const response = await services.session.request({
      method: 'POST',
      path: `${AUTH}/email/change`,
      body: { current_password: change.currentPassword, new_email: change.newEmail },
    });
    expectStatus(response, 202);
  } catch (error) {
    throw asAccountError(error);
  }
}

// --- the account and its devices ----------------------------------------------------------------------------------

export async function refreshAccount(services: AccountServices): Promise<LocalAccount> {
  try {
    return signedIn(services, expect<Schemas['AccountResponse']>(await services.session.request({ method: 'GET', path: `${AUTH}/me` }), 200));
  } catch (error) {
    throw asAccountError(error);
  }
}

export async function updateAccount(services: AccountServices, changes: AccountChanges): Promise<LocalAccount> {
  try {
    const response = await services.session.request({
      method: 'PATCH',
      path: `${AUTH}/me`,
      body: {
        ...(changes.displayName === undefined ? {} : { display_name: changes.displayName }),
        ...(changes.locale === undefined ? {} : { locale: changes.locale }),
        ...(changes.unitSystem === undefined ? {} : { unit_system: changes.unitSystem }),
      },
    });
    return signedIn(services, expect<Schemas['AccountResponse']>(response, 200));
  } catch (error) {
    throw asAccountError(error);
  }
}

export async function listSessions(services: AccountServices): Promise<DeviceSession[]> {
  try {
    const sessions = expect<Schemas['SessionResponse'][]>(
      await services.session.request({ method: 'GET', path: `${AUTH}/sessions` }),
      200,
    );
    return sessions.map((session) => ({ id: session.id, deviceName: session.device_name ?? null, current: session.current }));
  } catch (error) {
    throw asAccountError(error);
  }
}

export async function revokeSession(services: AccountServices, sessionId: string): Promise<void> {
  try {
    expectStatus(await services.session.request({ method: 'DELETE', path: `${AUTH}/sessions/${encodeURIComponent(sessionId)}` }), 204);
  } catch (error) {
    throw asAccountError(error);
  }
}

// --- helpers ------------------------------------------------------------------------------------------------------

function expectStatus(response: ApiResponse, status: number): void {
  if (response.status !== status) {
    throw accountErrorFrom(response);
  }
}

function expect<Body>(response: ApiResponse, status: number): Body {
  expectStatus(response, status);
  return JSON.parse(response.body) as Body;
}

function signedIn(services: AccountServices, body: Schemas['AccountResponse']): LocalAccount {
  const account: LocalAccount = {
    id: body.id,
    email: body.email,
    emailVerified: body.email_verified,
    displayName: body.display_name,
    unitSystem: body.unit_system,
    locale: body.locale,
    timezone: body.timezone,
  };
  services.accounts.save(account, services.now());
  setSessionState({ status: 'signed-in', account });
  return account;
}

async function endHere(services: AccountServices): Promise<void> {
  await services.session.end();
  await services.keys.forget();
  setSessionState({ status: 'signed-out' });
}

function toWire(wrapped: WrappedPrivacyKey) {
  return { wrapped_key: wrapped.wrappedKey, salt: wrapped.salt, kdf: wrapped.kdf };
}

function fromWire(wire: Schemas['PrivacyKeyOut']): WrappedPrivacyKey {
  return { wrappedKey: wire.wrapped_key, salt: wire.salt, kdf: wire.kdf };
}

export { AccountError };
