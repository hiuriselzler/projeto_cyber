/**
 * `useStableHandler` — one identity for the life of the component, and always the latest handler behind it. The first
 * half is what lets the memoized set rows skip a render; the second is what keeps a ✓ from being judged against the
 * rows as they were a tap ago (task 004's closing pass).
 */
import { renderHook } from '@testing-library/react-native';

import { useStableHandler } from '../useStableHandler';

describe('useStableHandler', () => {
  it('keeps one identity across renders with a new handler each time', async () => {
    const { result, rerender } = await renderHook(
      ({ handler }: { handler: (value: number) => number }) => useStableHandler(handler),
      { initialProps: { handler: (value: number) => value } },
    );
    const first = result.current;

    await rerender({ handler: (value: number) => value * 2 });
    expect(result.current).toBe(first);
  });

  it('calls the handler of the latest render, with its arguments and its result', async () => {
    const { result, rerender } = await renderHook(
      ({ factor }: { factor: number }) => useStableHandler((value: number) => value * factor),
      { initialProps: { factor: 1 } },
    );
    const stable = result.current;
    expect(stable(5)).toBe(5);

    await rerender({ factor: 3 });
    expect(stable(5)).toBe(15);
  });
});
