import { StyleSheet, View } from 'react-native';

import { useT } from '../i18n/LocaleProvider';
import { space } from '../tokens';
import { Chip } from './Chip';

const DEFAULT_VALUES: readonly number[] = [0, 1, 2, 3, 4, 5];

interface RirChipsProps {
  /** The recorded RIR, or null when none was recorded — never 0 in its place (INV-03). */
  readonly value: number | null;
  readonly onChange: (value: number | null) => void;
  readonly values?: readonly number[];
  /** Whether the last chip reads as "or more", as `5+`. What that stores is task 004's decision. */
  readonly openEnded?: boolean;
}

/**
 * RIR as one tap on a chip row, never a keyboard (FR-2.10). Tapping the selected chip clears it back to not recorded.
 */
export function RirChips({ value, onChange, values = DEFAULT_VALUES, openEnded = true }: RirChipsProps) {
  const t = useT();
  const last = values[values.length - 1];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('a11y.rir_chips')} style={styles.row}>
      {values.map((option) => {
        const isOpenEnded = openEnded && option === last;
        return (
          <Chip
            key={option}
            size="workout"
            role="radio"
            selected={value === option}
            label={isOpenEnded ? `${option}+` : String(option)}
            accessibilityLabel={isOpenEnded ? t('a11y.rir_open_ended', { rir: option }) : t('a11y.rir', { rir: option })}
            onPress={() => onChange(value === option ? null : option)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
