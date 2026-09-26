import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { bootstrapAccount, restoreAccountSession } from '@/account/bootstrap';
import { seedLocalReferenceData, useLocalMigrations } from '@/db/migrate';
import { PreferencesProvider } from '@/features/settings';

// The root layout calls exactly two entry points below it (ADR-012 § Amendment). The bootstrap runs
// before anything renders, so a build given an API base URL it may not use refuses to start (04 §5).
bootstrapAccount();

const queryClient = new QueryClient();

export default function RootLayout() {
  const migrations = useLocalMigrations();

  // The session is restored from the local database, so only once its migrations have run — and never over the
  // network (NFR-1). The catalog is seeded first, in the same step: a schema with no exercises is a device that
  // cannot log anything, and until the task 004 stage-3 device pass nothing called the seed at all.
  //
  // A seed that throws is left to throw. React surfaces an error raised in an effect, and a failed seed is a broken
  // install rather than a state to render around — swallowing it is what made this invisible for a stage.
  useEffect(() => {
    if (migrations.success) {
      seedLocalReferenceData();
      void restoreAccountSession();
    }
  }, [migrations.success]);

  if (migrations.error) {
    throw migrations.error;
  }
  if (!migrations.success) {
    return null;
  }
  // SafeAreaProvider is what `Screen` reads its insets from. It wraps everything, because a screen
  // rendered outside it has no inset value to read.
  return (
    <SafeAreaProvider>
      <PreferencesProvider>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }} />
        </QueryClientProvider>
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}
