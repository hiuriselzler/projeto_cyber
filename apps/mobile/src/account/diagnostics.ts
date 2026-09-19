/**
 * Debug-only checks behind the diagnostics screen (ADR-012 § Amendment). Features reach the network
 * and secure storage only through this folder, and this file is absent from release builds.
 */
import { readDiagnosticsProbe, writeDiagnosticsProbe } from '@/crypto';
import {
  assertApiBaseUrlAllowed,
  currentBuildKind,
  InsecureApiBaseUrlError,
  probeRawRequest,
} from '@/sync';

import { bootstrapAccount } from './bootstrap';

export async function checkServerReadiness(): Promise<string> {
  const response = await bootstrapAccount().get('/health/ready');
  return `HTTP ${response.status} ${response.body}`;
}

export interface LanAddressCheck {
  /** What the app's own guard says about the address. It must refuse it. */
  readonly guard: string;
  /** What Android's network security config does with a raw request. It must refuse it too. */
  readonly platform: string;
}

export async function checkLanAddressRefused(baseUrl: string): Promise<LanAddressCheck> {
  let guard: string;
  try {
    assertApiBaseUrlAllowed(baseUrl, currentBuildKind());
    guard = 'ALLOWED — this is a failure';
  } catch (error) {
    guard = error instanceof InsecureApiBaseUrlError ? `refused: ${error.message}` : String(error);
  }
  return { guard, platform: await probeRawRequest(`${baseUrl}/health`) };
}

export interface SecureStorageCheck {
  /** The value a previous launch wrote. Non-null after a restart proves it survived. */
  readonly previous: string | null;
  readonly roundTripped: boolean;
}

export async function checkSecureStorage(): Promise<SecureStorageCheck> {
  const previous = await readDiagnosticsProbe();
  const value = `written at ${new Date().toISOString()}`;
  await writeDiagnosticsProbe(value);
  return { previous, roundTripped: (await readDiagnosticsProbe()) === value };
}

/**
 * Task 017, from task 003: the privacy-key criteria only a phone and real libsodium settle — a wrap
 * opening on a second device, a password change against a reset, superseded KDF parameters, and the
 * derivation's measured cost. `src/crypto` does all of it; screens reach it through this folder
 * (ADR-012 §2), and it runs on a throwaway key, never the signed-in user's.
 */
export {
  probePrivacyKeyLifecycle as checkPrivacyKeyLifecycle,
  type PrivacyKeyProbe,
  type PrivacyKeyProbeStep,
} from '@/crypto';
