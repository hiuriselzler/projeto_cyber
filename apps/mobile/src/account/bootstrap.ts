import { activeBlocks, reconcileBlocks } from '@/db/planner';
import { localDayOf } from '@/db/strength';
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

/**
 * Once local migrations have run: restores the session from the device, with no network on the path (NFR-1).
 *
 * Then, for a signed-in user, reconciles every active training block — idempotent and cheap, so a crash between a
 * workout finishing and its reconciliation never leaves the plan stale (task 005 stage 4a, decision 4). It runs after
 * the session is restored and never delays it; a block that fails is left for the next launch.
 */
export async function restoreAccountSession(): Promise<SessionState> {
  const state = await restoreSession(accountServices());
  if (state.status === 'signed-in') {
    const userId = state.account.id;
    const now = Date.now();
    void reconcileBlocks(userId, activeBlocks(userId), localDayOf(now), now);
  }
  return state;
}

export function accountServices(): AccountServices {
  bootstrapAccount();
  return services as AccountServices;
}
