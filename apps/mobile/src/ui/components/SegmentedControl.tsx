import { StyleSheet, View } from 'react-native';

import { space } from '../tokens';
import { Chip } from './Chip';

export interface SegmentedOption<Value extends string> {
  readonly value: Value;
  /** Already translated by the caller. */
  readonly label: string;
}

interface SegmentedControlProps<Value extends string> {
  readonly options: readonly SegmentedOption<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  /** What the group is, for a screen reader; already translated. */
  readonly accessibilityLabel: string;
}

/** One choice among a few, each a full-size target. The selected option is marked as a chip marks it (INV-24). */
export function SegmentedControl<Value extends string>({ options, value, onChange, accessibilityLabel }: SegmentedControlProps<Value>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.row}>
      {options.map((option) => (
        <View key={option.value} style={styles.segment}>
          <Chip role="radio" label={option.label} selected={option.value === value} onPress={() => onChange(option.value)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  segment: { flexGrow: 1 },
});
