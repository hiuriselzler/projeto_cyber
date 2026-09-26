import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A function whose identity never changes and that always runs the latest `handler`.
 *
 * For the live workout's set rows, which are memoized so that a ✓ re-renders the row it ticked and not the other
 * nineteen (task 004's closing pass: all twenty re-rendered, ~83 % of the ✓'s render). A handler that closes over the
 * workout changes with every re-read, and handing that to a memoized row would defeat the memo; handing it a stale
 * copy instead would be worse — a ✓ judged against the rows as they were a tap ago.
 *
 * The latest handler is stored after commit, never during render, and only called from events, which cannot fire
 * between a render and its commit.
 */
export function useStableHandler<A extends unknown[], R>(handler: (...args: A) => R): (...args: A) => R {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
