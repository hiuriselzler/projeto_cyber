/**
 * Task 001's secure-storage probe, for the debug-only diagnostics screen. Its storage key, like every storage key in
 * this folder, stays private to its file.
 */
import * as SecureStore from 'expo-secure-store';

const DIAGNOSTICS_PROBE_KEY = 'diagnostics.probe';

export function readDiagnosticsProbe(): Promise<string | null> {
  return SecureStore.getItemAsync(DIAGNOSTICS_PROBE_KEY);
}

export async function writeDiagnosticsProbe(value: string): Promise<void> {
  await SecureStore.setItemAsync(DIAGNOSTICS_PROBE_KEY, value);
}
