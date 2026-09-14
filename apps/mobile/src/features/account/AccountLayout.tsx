import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AccountError, type AccountErrorCode } from '@/account';
import { AppText, Screen, space, useT } from '@/ui';

/** Every account screen: a title and a column of fields and actions, scrollable at 200 % font scale (07 §8). */
export function AccountLayout({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </Screen>
  );
}

/** A form's submission: whether it is working, and why it last failed, in words (INV-27). */
export function useSubmission() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AccountErrorCode | null>(null);

  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(caught instanceof AccountError ? caught.code : 'unknown');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, run, error: error === null ? undefined : t(`account.errors.${error}`) };
}

const styles = StyleSheet.create({
  content: { padding: space[4], gap: space[6] },
  body: { gap: space[4] },
});
