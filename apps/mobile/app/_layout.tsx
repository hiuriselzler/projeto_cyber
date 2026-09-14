import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';

import { bootstrapAccount } from '@/account/bootstrap';
import { useLocalMigrations } from '@/db/migrate';
import { PreferencesProvider } from '@/features/settings';

// The root layout calls exactly two entry points below it (ADR-012 § Amendment). The bootstrap runs
// before anything renders, so a build given an API base URL it may not use refuses to start (04 §5).
bootstrapAccount();

const queryClient = new QueryClient();

export default function RootLayout() {
  const migrations = useLocalMigrations();

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
