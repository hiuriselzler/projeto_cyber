import { useState, useSyncExternalStore } from 'react';

import {
  getSessionState,
  subscribeToSession,
  updateAccount,
  type AccountChanges,
  type LocalAccount,
} from '@/account';
import { SegmentedControl, type SegmentedOption } from '@/ui';

import { Check } from './Check';

/** Developer-facing, so written out rather than translated (ADR-014). */
const UNIT_OPTIONS: readonly SegmentedOption<LocalAccount['unitSystem']>[] = [
  { value: 'metric', label: 'metric' },
  { value: 'imperial', label: 'imperial' },
];

const LOCALE_OPTIONS: readonly SegmentedOption<LocalAccount['locale']>[] = [
  { value: 'pt-BR', label: 'pt-BR' },
  { value: 'en', label: 'en' },
];

/**
 * The imperial and language passes' way in (task 004 stage 8, decision 5). `updateAccount` sends `PATCH /auth/me`,
 * keeps the answer on the device and republishes the session, so every screen follows — and a stage-7 lesson says why
 * this exists at all: `updateAccount` was written and tested and **no screen called it**. It needs the API: Docker up
 * and `adb reverse tcp:8000 tcp:8000`. The product's own settings screen is open question 19, not this.
 */
export function AccountPreferences() {
  const session = useSyncExternalStore(subscribeToSession, getSessionState);
  const [outcome, setOutcome] = useState('not changed from here');
  const account = session.status === 'signed-in' ? session.account : null;

  const change = (changes: AccountChanges) => {
    setOutcome('saving…');
    updateAccount(changes)
      .then((saved) => setOutcome(`saved: ${saved.unitSystem} · ${saved.locale}`))
      .catch((error: unknown) => setOutcome(`failed: ${String(error)}`));
  };

  if (account === null) {
    return <Check title="Units and language (PATCH /auth/me)">not signed in</Check>;
  }
  return (
    <>
      <Check title="Units and language (PATCH /auth/me; needs the local API)">
        {`account: ${account.unitSystem} · ${account.locale}\n${outcome}`}
      </Check>
      <SegmentedControl
        accessibilityLabel="Unit system"
        options={UNIT_OPTIONS}
        value={account.unitSystem}
        onChange={(unitSystem) => change({ unitSystem })}
      />
      <SegmentedControl
        accessibilityLabel="Language"
        options={LOCALE_OPTIONS}
        value={account.locale}
        onChange={(locale) => change({ locale })}
      />
    </>
  );
}
