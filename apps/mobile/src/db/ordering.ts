/**
 * Ordering and superset grouping, pure — shared by routines (`./routines`) and the live session (`./strength`).
 *
 * Both hold an ordered list of exercises where neighbours sharing a `superset_group` alternate (FR-2.6), and both
 * must re-read those groups the same way after anything moves. One home, so a routine and the workout started from it
 * can never disagree about what a superset is.
 */

/**
 * Superset groups as contiguous runs, numbered 1..n from the top, with a lone member set back to null.
 *
 * A group is only meaningful as a run of neighbours — the live workout alternates between *adjacent* exercises
 * (FR-2.6). So after anything that moves rows, a group is re-read as runs: two runs that happen to share a number are
 * two groups, and a run of one is no superset at all. Numbering from the top keeps the stored values boring, which is
 * what a value a sync diff has to read should be.
 */
export function normaliseSupersets(groups: readonly (number | null)[]): (number | null)[] {
  const result: (number | null)[] = groups.map(() => null);
  let next = 1;
  let start = 0;
  while (start < groups.length) {
    const group = groups[start] ?? null;
    let end = start + 1;
    while (group !== null && end < groups.length && groups[end] === group) end += 1;
    if (group !== null && end - start > 1) {
      for (let at = start; at < end; at += 1) result[at] = next;
      next += 1;
    }
    start = end;
  }
  return result;
}

/**
 * Link the exercise at `index` to the one below it, or unlink them if they are already linked.
 *
 * Linking merges the two runs they belong to. Unlinking splits the run between them, so a three-exercise giant set
 * cut in the middle becomes a pair and a single — never a pair whose third member silently stays attached.
 */
export function toggleSupersetWithNext(groups: readonly (number | null)[], index: number): (number | null)[] {
  if (index < 0 || index >= groups.length - 1) return normaliseSupersets(groups);
  const current = normaliseSupersets(groups);
  const here = current[index] ?? null;
  const below = current[index + 1] ?? null;

  if (here !== null && here === below) {
    // Split: everything from `index + 1` down that was in this run moves to a fresh number.
    const fresh = Math.max(0, ...current.map((group) => group ?? 0)) + 1;
    const split = [...current];
    for (let at = index + 1; at < split.length && current[at] === here; at += 1) split[at] = fresh;
    return normaliseSupersets(split);
  }

  // Merge: both runs take this one's number, or a fresh one if neither had a group.
  const merged = here ?? below ?? Math.max(0, ...current.map((group) => group ?? 0)) + 1;
  const joined = current.map((group) => (group !== null && (group === here || group === below) ? merged : group));
  joined[index] = merged;
  joined[index + 1] = merged;
  return normaliseSupersets(joined);
}

/** A list with one item moved from `from` to `to`, everything else keeping its relative order. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const result = [...items];
  const [moved] = result.splice(from, 1);
  if (moved !== undefined) result.splice(to, 0, moved);
  return result;
}
