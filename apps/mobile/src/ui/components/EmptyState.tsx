import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../tokens';
import { AppText } from './AppText';

interface EmptyStateProps {
  /** Already translated by the caller. */
  readonly title: string;
  readonly body?: string;
  /** A technical line diagram in the mark's language, never a spot illustration of people (07 §9). */
  readonly illustration?: ReactNode;
  readonly action?: ReactNode;
}

/** What a screen shows before there is anything to show. A plain statement, and at most one way forward. */
export function EmptyState({ title, body, illustration, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {illustration}
      <AppText variant="title" style={styles.centred}>
        {title}
      </AppText>
      {body === undefined ? null : (
        <AppText tone="textSecondary" style={styles.centred}>
          {body}
        </AppText>
      )}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[12] },
  centred: { textAlign: 'center' },
});
