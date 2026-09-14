import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { radii, sizes, space } from '../tokens';
import { AppText } from './AppText';

export interface ButtonProps {
  /** Already translated by the caller. */
  readonly label: string;
  readonly onPress: () => void;
  /** `primary` is the one action a screen is for; `quiet` is a link-like way elsewhere. */
  readonly variant?: 'primary' | 'secondary' | 'quiet';
  readonly disabled?: boolean;
  /** Working: the button shows `busyLabel` and a spinner, and cannot be pressed again. */
  readonly busy?: boolean;
  readonly busyLabel?: string;
}

/**
 * A full-size target (07 §4). Unavailable is a changed fill, edge and label as well as the screen reader's state, never
 * a dimmed colour alone (INV-24).
 */
export function Button({ label, onPress, variant = 'primary', disabled = false, busy = false, busyLabel }: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || busy;
  const filled = variant === 'primary' && !inactive;
  const shown = busy && busyLabel !== undefined ? busyLabel : label;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={shown}
      accessibilityState={{ disabled: inactive, busy }}
      style={[
        styles.button,
        {
          backgroundColor: filled ? colors.accent : inactive && variant === 'primary' ? colors.bgElevated : 'transparent',
          borderColor: variant === 'quiet' ? 'transparent' : colors.borderStrong,
          borderWidth: variant === 'quiet' || filled ? 0 : sizes.edgeHairline,
        },
      ]}
    >
      <View style={styles.content}>
        {busy ? <ActivityIndicator color={filled ? colors.textOnAccent : colors.accent} /> : null}
        <AppText variant="label" tone={filled ? 'textOnAccent' : inactive ? 'textSecondary' : 'accent'}>
          {shown}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: sizes.targetMin,
    borderRadius: radii.md,
    paddingHorizontal: space[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
