import type { ComponentType } from 'react';

import { AccountFrame, SessionGate } from '@/features/account';

// The diagnostics screen belongs to debug builds only. A release bundle has __DEV__ replaced by false,
// which makes this branch dead code, so the require behind it is not bundled.
function chooseHomeScreen(): ComponentType {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const diagnostics = require('@/features/diagnostics') as typeof import('@/features/diagnostics');
    return diagnostics.DiagnosticsScreen;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const home = require('@/features/home') as typeof import('@/features/home');
  return home.HomeScreen;
}

const HomeScreen = chooseHomeScreen();

export default function Index() {
  return (
    <SessionGate>
      <AccountFrame>
        <HomeScreen />
      </AccountFrame>
    </SessionGate>
  );
}
