import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { radii, sizes, space } from '../tokens';
import { AppText } from './AppText';

export interface ChipProps {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly role?: 'radio' | 'checkbox' | 'button';
  /** What a screen reader says, when the visible label is not enough on its own. */
  readonly accessibilityLabel?: string;
  /** `workout` is 56 dp and sets its label as a numeral (07 §5). */
  readonly size?: 'standard' | 'workout';
  /**
   * Whether this chip has opened something — RIR's `5+` and its second row.
   *
   * A chip that reveals more is a disclosure, not a choice, and a screen reader has to hear the difference:
   * without this it would announce a press that stored nothing as though it had stored something.
   */
  readonly expanded?: boolean;
}

/**
 * A selectable chip. Selected is three signals, never the fill alone (07 §3, INV-24): the `accentDeep` fill, a thicker
 * `accent` edge — a shape change — and the screen reader's checked state.
 */
export function Chip({
  label,
  selected,
  onPress,
  role = 'button',
  accessibilityLabel,
  size = 'standard',
  expanded,
}: ChipProps) {
  const { colors } = useTheme();
  const target = size === 'workout' ? sizes.targetWorkout : sizes.targetMin;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={{
        ...(role === 'button' ? { selected } : { checked: selected }),
        ...(expanded === undefined ? {} : { expanded }),
      }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.chip,
        {
          minHeight: target,
          minWidth: target,
          backgroundColor: selected ? colors.accentDeep : 'transparent',
          borderColor: selected ? colors.accent : colors.borderStrong,
          borderWidth: selected ? sizes.edgeSelected : sizes.edgeHairline,
        },
      ]}
    >
      <AppText variant={size === 'workout' ? 'metric' : 'label'}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    paddingHorizontal: space[3],
  },
});
