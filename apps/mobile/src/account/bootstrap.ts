import { createConfiguredApiClient, type ApiClient } from '@/sync';

import { forgetEndedSession, restoreSession } from './flows';
import { createAccountServices, type AccountServices } from './services';
import type { SessionState } from './session';

let services: AccountServices | null = null;

/**
 * What the root layout calls at launch (ADR-012 § Amendment). It proves the API base URL is one this build may use —
 * throwing otherwise, so the app refuses to start (04 §5) — and wires the session. Task 006 adds starting sync.
 */
export function bootstrapAccount(): ApiClient {
  if (services === null) {
    const created = createAccountServices(createConfiguredApiClient());
    created.session.onEnded(() => void forgetEndedSession(created));
    services = created;
  }
  return services.api;
}

/** Once local migrations have run: restores the session from the device, with no network on the path (NFR-1). */
export function restoreAccountSession(): Promise<SessionState> {
  return restoreSession(accountServices());
}

export function accountServices(): AccountServices {
  bootstrapAccount();
  return services as AccountServices;
}
