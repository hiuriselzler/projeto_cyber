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
