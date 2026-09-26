import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** One diagnostics result: a bold title and a selectable body. Developer-facing, so never translated (ADR-014). */
export function Check({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.check}>
      <Text style={styles.title}>{title}</Text>
      <Text selectable>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  check: { gap: 4 },
  title: { fontWeight: 'bold' },
});
