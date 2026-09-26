import { targetProblem, type RoutineTargets, type TargetProblem } from '@/db/routines';

/** What the targets sheet edits: the three counts as the text in their fields, RIR and rest as chosen values. */
export interface TargetsDraft {
  readonly sets: string;
  readonly minReps: string;
  readonly maxReps: string;
  readonly rir: number | null;
  readonly restSeconds: number | null;
}

/**
 * The rests offered as one-tap choices, in seconds. Choices, not a default: none is pre-selected, and "off" — no timer
 * — is what a routine exercise starts with (task 004 § Stages, decision 1).
 */
export const REST_CHOICES: readonly number[] = [30, 60, 90, 120, 180, 300];

export function draftFromTargets(targets: RoutineTargets): TargetsDraft {
  return {
    sets: countText(targets.targetSets),
    minReps: countText(targets.targetMinReps),
    maxReps: countText(targets.targetMaxReps),
    rir: targets.targetRir,
    restSeconds: targets.restSeconds,
  };
}

/**
 * The draft as targets, or what is wrong with it. A blank field is "not set" and stores null, never 0 — the same rule
 * as a blank weight or a blank RIR on the set row.
 */
export function targetsFromDraft(
  draft: TargetsDraft,
): { readonly targets: RoutineTargets } | { readonly problem: TargetProblem } {
  const sets = parseCount(draft.sets);
  const minReps = parseCount(draft.minReps);
  const maxReps = parseCount(draft.maxReps);
  if (Number.isNaN(sets)) return { problem: 'sets' };
  if (Number.isNaN(minReps) || Number.isNaN(maxReps)) return { problem: 'reps' };

  const targets: RoutineTargets = {
    targetSets: sets,
    targetMinReps: minReps,
    targetMaxReps: maxReps,
    targetRir: draft.rir,
    restSeconds: draft.restSeconds,
  };
  const problem = targetProblem(targets);
  return problem === null ? { targets } : { problem };
}

/** Rest choices to show: the standard ones, plus the stored value if it is none of them, in order. */
export function restChoices(current: number | null): number[] {
  return current === null || REST_CHOICES.includes(current)
    ? [...REST_CHOICES]
    : [...REST_CHOICES, current].sort((a, b) => a - b);
}

function countText(value: number | null): string {
  return value === null ? '' : String(value);
}

/** Blank is null; digits are a number; anything else is `NaN`, which the caller reports on its field. */
function parseCount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}
