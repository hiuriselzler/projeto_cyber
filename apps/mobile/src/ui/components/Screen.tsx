import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';

/**
 * A screen's ground: the theme's `bgAbyss`, so both themes reach every screen end to end (INV-23),
 * and the system's own insets, so nothing is drawn under the status bar or the gesture handle.
 *
 * The inset belongs here rather than in each screen. The app draws its own headers
 * (`headerShown: false`), so without it every screen would have to remember — and on a phone, task
 * 017 found exactly that: `Entrar` and `Crie sua conta` were painted behind the clock. One container
 * fixes every screen that uses it and every screen written later, which is the same argument INV-23
 * makes for tokens. The colour is still the ground; the padding is the frame.
 */
export function Screen({ children }: { readonly children?: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="screen"
      style={[
        styles.screen,
        { backgroundColor: colors.bgAbyss, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
