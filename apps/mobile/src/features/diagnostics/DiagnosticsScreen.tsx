import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  checkLanAddressRefused,
  checkSecureStorage,
  checkServerReadiness,
  type LanAddressCheck,
} from '@/account/diagnostics';
import { EXPECTED_TABLES, readLocalDatabaseState } from '@/db/diagnostics';
import { describePlatform } from '@/platform';

import { useDiagnosticsStore } from './store';

/**
 * Task 001's on-device checks. Debug builds only: developer-facing, never shown to a user, so its text
 * is not translated (INV-27 governs user-facing strings).
 */
export function DiagnosticsScreen() {
  const readiness = useQuery({ queryKey: ['diagnostics', 'readiness'], queryFn: checkServerReadiness });
  // Once per launch: a refetch would overwrite the value the next launch must find.
  const storage = useQuery({
    queryKey: ['diagnostics', 'secure-storage'],
    queryFn: checkSecureStorage,
    staleTime: Infinity,
  });
  const [database] = useState(readLocalDatabaseState);
  const [lanBaseUrl, setLanBaseUrl] = useState('http://192.168.0.10:8000');
  const [lanCheck, setLanCheck] = useState<LanAddressCheck | null>(null);
  const taps = useDiagnosticsStore((state) => state.taps);
  const tap = useDiagnosticsStore((state) => state.tap);
  const platform = describePlatform();

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Check title="Platform interface (src/platform)">
        {`${platform.os} ${platform.osVersion}`}
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

      <Check title="Secure storage (restart the app: the previous value must survive)">
        {storage.isPending
          ? 'checking…'
          : storage.isError
            ? `failed: ${String(storage.error)}`
            : `round trip: ${storage.data.roundTripped ? 'ok' : 'FAILED'} · previous launch wrote: ${storage.data.previous ?? 'nothing yet'}`}
      </Check>

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
