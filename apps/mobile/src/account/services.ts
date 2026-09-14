/**
 * Everything the account flows reach outside this folder, gathered in one object so the flows can be tested against
 * fakes: the network and the session through `src/sync`, the privacy key through `src/crypto`, the cached account
 * through `src/db` (ADR-012).
 */
import {
  forgetPrivacyKey,
  prepareNewPrivacyKey,
  rewrapPrivacyKey,
  unwrapPrivacyKey,
  uuidV7,
  type PreparedPrivacyKey,
  type WrappedPrivacyKey,
} from '@/crypto';
import { readLocalAccount, saveLocalAccount, type LocalAccount } from '@/db/account';
import { SessionClient, secureSessionStore, type ApiClient, type SessionStore } from '@/sync';

export interface AccountServices {
  readonly api: ApiClient;
  readonly session: SessionClient;
  readonly store: SessionStore;
  readonly accounts: {
    save(account: LocalAccount, nowMs: number): void;
    read(id: string): LocalAccount | null;
  };
  readonly keys: {
    prepareNew(password: string): Promise<PreparedPrivacyKey>;
    unwrap(password: string, wrapped: WrappedPrivacyKey): Promise<void>;
    rewrap(newPassword: string): Promise<WrappedPrivacyKey>;
    forget(): Promise<void>;
  };
  readonly newId: (nowMs: number) => Promise<string>;
  readonly now: () => number;
  readonly timeZone: () => string;
}

export function createAccountServices(api: ApiClient): AccountServices {
  return {
    api,
    session: new SessionClient(api, secureSessionStore),
    store: secureSessionStore,
    accounts: { save: saveLocalAccount, read: readLocalAccount },
    keys: {
      prepareNew: prepareNewPrivacyKey,
      unwrap: unwrapPrivacyKey,
      rewrap: rewrapPrivacyKey,
      forget: forgetPrivacyKey,
    },
    newId: uuidV7,
    now: Date.now,
    timeZone: deviceTimeZone,
  };
}

/** The IANA zone the device is in, stored with the account (INV-17's `tz` defaults from it). */
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
