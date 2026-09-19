import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  checkLanAddressRefused,
  checkPrivacyKeyHeld,
  checkPrivacyKeyLifecycle,
  checkSecureStorage,
  checkServerReadiness,
  type LanAddressCheck,
  type PrivacyKeyProbe,
} from '@/account/diagnostics';
import {
  checkSqliteRoundTrip,
  EXPECTED_TABLES,
  measureTickLatency,
  readLocalDatabaseState,
  type TickLatency,
} from '@/db/diagnostics';
import { roundLoadToIncrement } from '@/domain';
import { describePlatform } from '@/platform';
import { SegmentedControl, useTheme, type SegmentedOption, type ThemePreference } from '@/ui';

import { useDiagnosticsStore } from './store';

/** Developer-facing, so written out rather than translated (ADR-014). */
const THEME_OPTIONS: readonly SegmentedOption<ThemePreference>[] = [
  { value: 'system', label: 'system' },
  { value: 'light', label: 'light' },
  { value: 'dark', label: 'dark' },
];

/**
 * Task 001's on-device checks, and task 011's theme override. Debug builds only: developer-facing, never shown to a
 * user, so its text is not translated (INV-27 governs user-facing strings; ADR-014 exempts this folder by name).
 */
export function DiagnosticsScreen() {
  const readiness = useQuery({ queryKey: ['diagnostics', 'readiness'], queryFn: checkServerReadiness });
  // Once per launch: a refetch would overwrite the value the next launch must find.
  const storage = useQuery({
    queryKey: ['diagnostics', 'secure-storage'],
    queryFn: checkSecureStorage,
    staleTime: Infinity,
  });
  const held = useQuery({ queryKey: ['diagnostics', 'privacy-key-held'], queryFn: checkPrivacyKeyHeld });
  const [database] = useState(readLocalDatabaseState);
  const [roundTrip] = useState(checkSqliteRoundTrip);
  const [lanBaseUrl, setLanBaseUrl] = useState('http://192.168.0.10:8000');
  const [lanCheck, setLanCheck] = useState<LanAddressCheck | null>(null);
  // Button-triggered: the probe pays for about eight argon2id derivations at 64 MiB, so running it
  // on mount would make the screen take seconds to open.
  const [privacyKey, setPrivacyKey] = useState<PrivacyKeyProbe | null>(null);
  const [privacyKeyRunning, setPrivacyKeyRunning] = useState(false);
  const [tickLatency, setTickLatency] = useState<TickLatency | null>(null);
  const taps = useDiagnosticsStore((state) => state.taps);
  const tap = useDiagnosticsStore((state) => state.tap);
  const platform = describePlatform();
  const theme = useTheme();
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Check title="Platform interface (src/platform)">
        {`${platform.os} ${platform.osVersion}`}
      </Check>

      <Check title="core-rs via UniFFI (task 017's ADR-004 spike, called through @cyberathlete/core-native)">
        {`round_to_increment(41.6, 2.5, nearest) = ${roundLoadToIncrement(41.6, 2.5, 'nearest')}\n` +
          `round_to_increment(41.25, 2.5, nearest) = ${roundLoadToIncrement(41.25, 2.5, 'nearest')}`}
      </Check>

      <Check title="API readiness over adb reverse (TanStack Query)">
        {readiness.isPending
          ? 'checking…'
          : readiness.isError
            ? `failed: ${String(readiness.error)}`
            : readiness.data}
      </Check>
      <Button title="Check again" onPress={() => void readiness.refetch()} />

      <Check title="Local SQLite schema (relaunch: migrations applied must not change)">
        {`migrations applied: ${database.migrationsApplied} · tables: ${database.tables} of ${EXPECTED_TABLES}`}
      </Check>

      <Check title="SQLite round trip: a workout, an exercise and 3 sets (03 §8 types)">
        {`${roundTrip.ok ? 'ok' : 'FAILED'}: ${roundTrip.detail}`}
      </Check>

      <Check title="Tapping ✓: the SQLite write plus the re-read the screen renders from (NFR-2 gives the whole tap 100 ms)">
        {tickLatency === null
          ? 'not run'
          : `${tickLatency.taps} taps over ${tickLatency.sets} sets — ` +
            `p50 ${tickLatency.p50Ms} ms · p95 ${tickLatency.p95Ms} ms · worst ${tickLatency.worstMs} ms\n` +
            'React’s commit and the paint are on top of this; use the workout screen below to judge those.'}
      </Check>
      <Button title="Measure the ✓" onPress={() => setTickLatency(measureTickLatency())} />
      <Button title="Open the live workout screen" onPress={() => router.push('/workout')} />

      <Check title="Secure storage (restart the app: the previous value must survive)">
        {storage.isPending
          ? 'checking…'
          : storage.isError
            ? `failed: ${String(storage.error)}`
            : `round trip: ${storage.data.roundTripped ? 'ok' : 'FAILED'} · previous launch wrote: ${storage.data.previous ?? 'nothing yet'}`}
      </Check>

      <Check title="Privacy key held on this device (clear the app's data: must go no, then yes after signing in)">
        {held.isPending ? 'checking…' : held.isError ? `failed: ${String(held.error)}` : held.data ? 'yes' : 'no'}
      </Check>
      <Button title="Check again" onPress={() => void held.refetch()} />

      <Check title="Privacy key on real libsodium (task 003's device criteria, ADR-007)">
        {privacyKeyRunning
          ? 'running… about eight argon2id derivations at 64 MiB'
          : privacyKey === null
            ? 'not run'
            : `${privacyKey.steps
                .map((step) => `${step.ok ? 'ok' : 'FAILED'} — ${step.name}\n    ${step.detail}`)
                .join('\n')}\n\n` +
              `one wrap, so one derivation: ${privacyKey.deriveMs} ms · whole probe: ${privacyKey.totalMs} ms\n\n` +
              `what the server is sent — inspect it, no key material may appear:\n` +
              `  kdf: ${privacyKey.payload.kdf}\n` +
              `  salt: ${privacyKey.payload.salt}\n` +
              `  wrappedKey: ${privacyKey.payload.wrappedKey}`}
      </Check>
      <Button
        title="Run the privacy-key checks"
        disabled={privacyKeyRunning}
        onPress={() => {
          setPrivacyKeyRunning(true);
          void checkPrivacyKeyLifecycle()
            .then(setPrivacyKey)
            .finally(() => setPrivacyKeyRunning(false));
        }}
      />

      <Check title="An http:// LAN address must be refused">
        {lanCheck === null ? 'not run' : `guard: ${lanCheck.guard}\nplatform: ${lanCheck.platform}`}
      </Check>
      <TextInput
        value={lanBaseUrl}
        onChangeText={setLanBaseUrl}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <Button
        title="Try the LAN address"
        onPress={() => void checkLanAddressRefused(lanBaseUrl).then(setLanCheck)}
      />

      <Check title="Zustand">{`taps: ${taps}`}</Check>
      <Button title="Tap" onPress={tap} />

      <Check title="Theme override, stored on the device (task 011; relaunch: the choice must survive)">
        {`preference: ${theme.preference} · showing: ${theme.scheme}`}
      </Check>
      <SegmentedControl
        accessibilityLabel="Theme"
        options={THEME_OPTIONS}
        value={theme.preference}
        onChange={theme.setPreference}
      />
    </ScrollView>
  );
}

function Check({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.check}>
      <Text style={styles.title}>{title}</Text>
      <Text selectable>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  check: { gap: 4 },
  title: { fontWeight: 'bold' },
  input: { borderWidth: 1, padding: 8 },
});
