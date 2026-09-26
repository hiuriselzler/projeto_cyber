import type { RoutineSummary } from '@/db/routines';

export interface FolderGroup {
  /** The folder exactly as the user typed it, or null for routines filed nowhere (INV-27). */
  readonly folder: string | null;
  readonly routines: readonly RoutineSummary[];
}

/**
 * Routines grouped by folder, each group in the order its first routine appears, and routines kept in their own order
 * within it — FR-2.5's "folder-organise".
 *
 * Unfiled routines come first: they are the ones a newcomer has, and putting them under a heading they never created
 * would be the app inventing structure. Folders match exactly as typed, so "Push" and "push" are two folders — the
 * same rule as every other piece of user content, which is shown and compared as written.
 */
export function groupByFolder(routines: readonly RoutineSummary[]): FolderGroup[] {
  const unfiled: RoutineSummary[] = [];
  const folders = new Map<string, RoutineSummary[]>();
  for (const routine of routines) {
    if (routine.folder === null) {
      unfiled.push(routine);
      continue;
    }
    const group = folders.get(routine.folder);
    if (group === undefined) folders.set(routine.folder, [routine]);
    else group.push(routine);
  }
  return [
    ...(unfiled.length > 0 ? [{ folder: null, routines: unfiled }] : []),
    ...[...folders].map(([folder, grouped]) => ({ folder, routines: grouped })),
  ];
}
