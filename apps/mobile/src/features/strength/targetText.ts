import { formatDuration } from '@/ui';

/** `t` narrowed to what this file needs: a key and its arguments. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The targets a routine exercise, or a session copied from one, carries (03 §3–4). */
export interface TargetsLike {
  readonly targetSets?: number | null;
  readonly targetMinReps: number | null;
  readonly targetMaxReps: number | null;
  readonly targetRir: number | null;
  readonly restSeconds: number | null;
}

/**
 * Targets as one readable line — `3 sets · 6–8 reps · RIR 2 · rest 2:00` — or `null` when none is set.
 *
 * Each part is its own catalog message, so plurals and word order are the language's; only the separator is shared,
 * and it carries no letter to translate. A part that is not set is left out rather than shown as a dash: "no rest"
 * and "rest not decided" read the same to the lifter, and both mean no timer (task 004 § Stages, decision 1).
 */
export function targetSummary(targets: TargetsLike, t: Translate): string | null {
  const parts: string[] = [];
  const { targetSets, targetMinReps, targetMaxReps, targetRir, restSeconds } = targets;

  if (targetSets !== undefined && targetSets !== null) parts.push(t('routine.sets', { count: targetSets }));

  if (targetMinReps !== null && targetMaxReps !== null && targetMinReps !== targetMaxReps) {
    parts.push(t('routine.reps_range', { min: targetMinReps, max: targetMaxReps }));
  } else {
    const reps = targetMinReps ?? targetMaxReps;
    if (reps !== null) parts.push(t('routine.reps', { count: reps }));
  }

  if (targetRir !== null) parts.push(t('routine.rir', { rir: targetRir }));
  if (restSeconds !== null && restSeconds > 0) parts.push(t('routine.rest', { time: formatDuration(restSeconds) }));

  return parts.length === 0 ? null : parts.join(' · ');
}
