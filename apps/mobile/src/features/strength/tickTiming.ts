/** What one ✓ cost, in milliseconds from the tap. */
export interface TickTiming {
  /** The synchronous write and the re-read the screen renders from — the half `measureTickLatency` times. */
  readonly writeMs: number;
  /** Until the next frame after it: roughly React's commit on top. Not the paint, which nothing here can see. */
  readonly frameMs: number;
}

/**
 * On in a development build, off in a release one (`__DEV__` is inlined to false and the branch is dropped) and off
 * under Jest, which runs with `__DEV__` true and would print a line for every ✓ in the suite.
 *
 * **`EXPO_PUBLIC_TICK_TIMING=1` turns it on in a production bundle as well**, inlined at bundle time. A development
 * build's React runs its checks on unminified code, and the first real-session numbers (2026-09-25) put the next frame
 * at ~200 ms there — so the number NFR-2 is judged on comes from `npx expo start --no-dev --minify` with the flag set,
 * served to the development client. Nothing sets it for a store build.
 */
const ENABLED = (__DEV__ || process.env.EXPO_PUBLIC_TICK_TIMING === '1') && process.env.NODE_ENV !== 'test';

/**
 * **✓ latency on a real session** — task 004's closing decision 3.
 *
 * `measureTickLatency()` on the diagnostics screen times the write and the re-read on a synthetic session, with no
 * screen around them. NFR-2's 100 ms is about the screen a lifter is using: a routine-started workout with its rest bar
 * ticking once a second beside the rows. This times the ✓ where it happens and logs each tap, so the numbers are read
 * from logcat over a real session (`adb logcat -s ReactNativeJS`).
 *
 * It changes nothing it times: `run` is called exactly once, synchronously, and its result handed back — the write
 * still lands before the UI moves (INV-09). Kept in the code so the number can be taken again when task 005 puts plan
 * work on the same path.
 */
export function timeTick<T>(run: () => T, report: (timing: TickTiming) => void = logTick, enabled = ENABLED): T {
  if (!enabled) return run();
  const started = performance.now();
  const result = run();
  const writeMs = performance.now() - started;
  requestAnimationFrame(() => {
    report({ writeMs, frameMs: performance.now() - started });
  });
  return result;
}

function logTick({ writeMs, frameMs }: TickTiming): void {
  console.log(`[tick] write+read ${writeMs.toFixed(1)} ms · next frame ${frameMs.toFixed(1)} ms`);
}
