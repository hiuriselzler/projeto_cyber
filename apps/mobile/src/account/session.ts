/**
 * Who is signed in on this device, for every screen at once. Plain subscribe-and-read, so that `src/account` holds no
 * React: a screen reads it with `useSyncExternalStore`.
 */
import type { LocalAccount } from '@/db/account';

export type SessionState =
  | { readonly status: 'restoring' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly account: LocalAccount };

let state: SessionState = { status: 'restoring' };
const listeners = new Set<() => void>();

/** The same object until the state changes, as `useSyncExternalStore` requires. */
export function getSessionState(): SessionState {
  return state;
}

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSessionState(next: SessionState): void {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}
