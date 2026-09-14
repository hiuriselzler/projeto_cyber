import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { bootstrapAccount, restoreAccountSession } from '@/account/bootstrap';
import { useLocalMigrations } from '@/db/migrate';
import { PreferencesProvider } from '@/features/settings';

// The root layout calls exactly two entry points below it (ADR-012 § Amendment). The bootstrap runs
// before anything renders, so a build given an API base URL it may not use refuses to start (04 §5).
bootstrapAccount();

const queryClient = new QueryClient();

export default function RootLayout() {
  const migrations = useLocalMigrations();

  // The session is restored from the local database, so only once its migrations have run — and never over the
  // network (NFR-1).
  useEffect(() => {
    if (migrations.success) {
      void restoreAccountSession();
    }
  }, [migrations.success]);

  if (migrations.error) {
    throw migrations.error;
  }
  if (!migrations.success) {
    return null;
  }
  return (
    <PreferencesProvider>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </PreferencesProvider>
  );
}
