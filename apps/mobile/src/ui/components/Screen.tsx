import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/** A screen's ground: the theme's `bgAbyss`, so both themes reach every screen end to end (INV-23). */
export function Screen({ children }: { readonly children?: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.screen, { backgroundColor: colors.bgAbyss }]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
