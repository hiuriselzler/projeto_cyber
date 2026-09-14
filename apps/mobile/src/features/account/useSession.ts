import { useSyncExternalStore } from 'react';

import { getSessionState, subscribeToSession, type SessionState } from '@/account';

/** Who is signed in on this device; re-renders when that changes. */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribeToSession, getSessionState);
}
