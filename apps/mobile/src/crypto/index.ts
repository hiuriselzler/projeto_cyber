/**
 * Client-side cryptography and the privacy key (ADR-007). The only folder that may import a crypto
 * library, and one of two that may use expo-secure-store.
 *
 * The privacy key arrives in task 003. Until then this holds only the secure-storage probe that
 * task 001's diagnostics use; its storage key, like every storage key here, stays private to this file.
 */
import * as SecureStore from 'expo-secure-store';

const DIAGNOSTICS_PROBE_KEY = 'diagnostics.probe';

export function readDiagnosticsProbe(): Promise<string | null> {
  return SecureStore.getItemAsync(DIAGNOSTICS_PROBE_KEY);
}

export async function writeDiagnosticsProbe(value: string): Promise<void> {
  await SecureStore.setItemAsync(DIAGNOSTICS_PROBE_KEY, value);
}
