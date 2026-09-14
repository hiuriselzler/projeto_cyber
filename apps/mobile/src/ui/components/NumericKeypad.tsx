import { Pressable, StyleSheet, View } from 'react-native';

import { decimalSeparator } from '../format/number';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { useTheme } from '../theme/ThemeProvider';
import { radii, sizes, space } from '../tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { applyKey, type KeypadKey } from './keypad';

const ROWS: readonly (readonly KeypadKey[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['separator', '0', 'delete'],
];

interface NumericKeypadProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly onDone: () => void;
  readonly allowDecimal?: boolean;
  readonly maxFractionDigits?: number;
  readonly maxIntegerDigits?: number;
  /**
   * The keypad's height once laid out. It sits in the layout below the list rather than over it, and the list uses
   * this with `offsetToReveal` so the row being edited is never covered (07 §6).
   */
  readonly onHeightChange?: (height: number) => void;
}

/** The app's own keypad for weights and reps: large keys, the locale's separator, both separators accepted (07 §6). */
export function NumericKeypad({
  value,
  onChange,
  onDone,
  allowDecimal = true,
  maxFractionDigits = 2,
  maxIntegerDigits = 4,
  onHeightChange,
}: NumericKeypadProps) {
  const { colors } = useTheme();
  const { locale } = useLocale();
  const t = useT();
  const press = (key: KeypadKey) =>
    onChange(applyKey(value, key, { locale, allowDecimal, maxFractionDigits, maxIntegerDigits }));

  const keyStyle = [styles.key, { backgroundColor: colors.bgElevated, borderColor: colors.borderStrong }];

  return (
    <View
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={[styles.pad, { backgroundColor: colors.bgSurface, borderTopColor: colors.borderSubtle }]}
    >
      {ROWS.map((row) => (
        <View key={row.join()} style={styles.row}>
          {row.map((key) => {
            if (key === 'delete') {
              return (
                <Pressable key={key} accessibilityRole="button" accessibilityLabel={t('a11y.keypad_delete')} onPress={() => press(key)} style={keyStyle}>
                  <Icon name="backspace" color={colors.textPrimary} />
                </Pressable>
              );
            }
            if (key === 'separator') {
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y.keypad_separator')}
                  accessibilityState={{ disabled: !allowDecimal }}
                  disabled={!allowDecimal}
                  onPress={() => press(key)}
                  style={keyStyle}
                >
                  <AppText variant="metric" tone={allowDecimal ? 'textPrimary' : 'textMuted'}>
                    {decimalSeparator(locale)}
                  </AppText>
                </Pressable>
              );
            }
            return (
              <Pressable key={key} accessibilityRole="button" onPress={() => press(key)} style={keyStyle}>
                <AppText variant="metric">{key}</AppText>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={onDone} style={[styles.done, { backgroundColor: colors.accent }]}>
        <AppText variant="title" tone="textOnAccent">
          {t('ui.keypad.done')}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: space[2], gap: space[2], borderTopWidth: sizes.edgeHairline },
  row: { flexDirection: 'row', gap: space[2] },
  key: {
    flex: 1,
    minHeight: sizes.targetWorkout,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: sizes.edgeHairline,
  },
  done: { minHeight: sizes.targetWorkout, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
});
