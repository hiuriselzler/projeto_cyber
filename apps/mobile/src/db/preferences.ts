import { Storage } from 'expo-sqlite/kv-store';

/**
 * Device-only preferences, in expo-sqlite's key-value store: outside the schema, and never synced (07 §3). A phone used
 * in a dark gym and a tablet on a desk can reasonably hold different themes.
 */

/** The theme override, as `src/ui` names it: follow the system, or hold one theme. */
export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'preference.theme';
const THEMES: readonly string[] = ['system', 'light', 'dark'];

function isThemePreference(value: string | null): value is ThemePreference {
  return value !== null && THEMES.includes(value);
}

/** The stored override, or `system` when there is none — or when what is stored is not one this build knows. */
export function readThemePreference(): ThemePreference {
  const stored = Storage.getItemSync(THEME_KEY);
  return isThemePreference(stored) ? stored : 'system';
}

export function writeThemePreference(preference: ThemePreference): void {
  Storage.setItemSync(THEME_KEY, preference);
}

const SKIPPED_REST_KEY = 'workout.rest_skipped_after';

/**
 * The set whose rest the user skipped, or null.
 *
 * The running rest timer is derived from the database — the last completed set plus its exercise's rest — so it
 * survives a force-quit with no state of its own (task 004 § Stages, decision 2). *Skipping* it is the one extra fact,
 * and it lives here rather than in the schema: it is a device's opinion about a moment, never synced, and without it a
 * skipped timer would come back on the next launch. Keyed by the set, so the next tick starts a fresh timer untouched.
 */
export function readSkippedRest(): string | null {
  return Storage.getItemSync(SKIPPED_REST_KEY);
}

export function writeSkippedRest(setLogId: string): void {
  Storage.setItemSync(SKIPPED_REST_KEY, setLogId);
}

const PAST_END_KEY = 'workout.past_end';

/**
 * The chosen end of a workout being logged after the fact (FR-2.13), while it is still open — null for a workout
 * happening now, which is every other one.
 *
 * Kept here rather than in the schema, for the reason a skipped rest is: an open workout is never synced (task 006), so
 * this is a fact one device holds about a row only it has, and finishing turns it into the workout's `ended_at` — the
 * column that exists for it (task 004 § Stages, stage 6 decision 4). Keyed by the workout, so a record left behind by a
 * workout that never landed can never be mistaken for another's.
 */
export function readPastWorkoutEnd(workoutId: string): number | null {
  const stored = Storage.getItemSync(PAST_END_KEY);
  if (stored === null) return null;
  const [id, endsAt] = stored.split('|');
  const value = Number(endsAt);
  return id === workoutId && Number.isFinite(value) ? value : null;
}

export function writePastWorkoutEnd(workoutId: string, endsAt: number): void {
  Storage.setItemSync(PAST_END_KEY, `${workoutId}|${String(endsAt)}`);
}

export function clearPastWorkoutEnd(): void {
  Storage.removeItemSync(PAST_END_KEY);
}
