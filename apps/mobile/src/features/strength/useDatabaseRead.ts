import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * A value read from SQLite, held in state, and read again on demand and whenever its screen comes back into focus —
 * how a screen shows what the database now says after a write (INV-09: the rows are the truth, React holds a copy).
 *
 * **Why not `useMemo` with a revision counter** — which is what the catalog, the routines list and the routine editor
 * did until the task 004 stage 6 device pass, and why none of them ever showed a write until they were remounted. The
 * counter was read as `void revision;` so that bumping it would re-run the memo. The React Compiler, which the app is
 * bundled with and Jest is not, memoizes by what a computation actually *uses*: a `void` read uses nothing, so it
 * compiled to a cache keyed on `userId` alone and the counter was dropped. A routine created, an exercise added, a
 * catalog row hidden — all written, none shown. Every suite stayed green, exactly as `Sheet`'s did in stage 3.
 *
 * Here the re-read is a value put into state, which no memoizer can optimise away. `read` must be stable — a
 * `useCallback` over what it depends on — because a new one re-reads (on focus), which is also how a changed user or
 * route parameter is picked up.
 */
export function useDatabaseRead<T>(read: () => T): readonly [T, () => void] {
  const [value, setValue] = useState<T>(read);
  const reread = useCallback(() => {
    const fresh = read();
    // An updater, so a `T` that is itself a function could never be mistaken for one.
    setValue(() => fresh);
  }, [read]);
  useFocusEffect(reread);
  return [value, reread] as const;
}
