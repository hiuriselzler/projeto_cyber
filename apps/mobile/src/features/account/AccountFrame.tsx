import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, space, useT, useTheme } from '@/ui';

import { PendingDeletionNotice } from './PendingDeletionNotice';

/**
 * The home route's account edges, until a settings screen lists the account screens (task 019): a pending deletion
 * above what the route shows, and the way to delete the account below it.
 */
export function AccountFrame({ children }: { readonly children: ReactNode }) {
  const t = useT();
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={[styles.frame, { backgroundColor: colors.bgAbyss }]}>
      <View style={styles.edge}>
        <PendingDeletionNotice />
      </View>
      <View style={styles.content}>{children}</View>
      <View style={styles.edge}>
        <Button variant="quiet" label={t('account.delete.link')} onPress={() => router.push('/account/delete')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  content: { flex: 1 },
  edge: { paddingHorizontal: space[4] },
});
