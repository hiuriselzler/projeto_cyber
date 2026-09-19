import { StyleSheet, View } from 'react-native';

import {
  AppText,
  keypadWeightToKilograms,
  NumericKeypad,
  parseDecimalInput,
  RirChips,
  sizes,
  space,
  useLocale,
  useT,
  useTheme,
  type SetRowField,
} from '@/ui';

export interface SetEditorProps {
  readonly field: SetRowField;
  /** What the keypad currently reads, in the user's own unit and separator. Ignored when editing RIR. */
  readonly draft: string;
  readonly rir: number | null;
  readonly onDraftChange: (next: string) => void;
  /** The parsed value, in SI, written on every keystroke (INV-09). Null is "not recorded", never 0 (INV-03). */
  readonly onValueChange: (value: number | null) => void;
  readonly onRirChange: (value: number | null) => void;
  readonly onDone: () => void;
  readonly onHeightChange: (height: number) => void;
}

const HEADING: Record<SetRowField, string> = {
  weight: 'workout.edit_weight',
  reps: 'workout.edit_reps',
  rir: 'workout.edit_rir',
};

/**
 * What sits under the set row while a field is being edited: the app's own keypad for weight and reps, and the chip
 * row for RIR — **never the OS keyboard**, which is slow, fights the Brazilian decimal comma, and eats the screen
 * (07 §6, FR-2.10).
 *
 * Reps take the same keypad with the separator off: a rep count is a whole number, and a keypad that will not let you
 * type `6,5` reps is better than one that accepts it and rounds later.
 */
export function SetEditor({
  field,
  draft,
  rir,
  onDraftChange,
  onValueChange,
  onRirChange,
  onDone,
  onHeightChange,
}: SetEditorProps) {
  const { colors } = useTheme();
  const { unitSystem } = useLocale();
  const t = useT();

  const change = (next: string) => {
    onDraftChange(next);
    onValueChange(
      field === 'weight' ? keypadWeightToKilograms(next, unitSystem) : wholeNumber(parseDecimalInput(next)),
    );
  };

  return (
    <View
      onLayout={(event) => onHeightChange(event.nativeEvent.layout.height)}
      style={[styles.editor, { backgroundColor: colors.bgSurface, borderTopColor: colors.borderSubtle }]}
    >
      <AppText variant="label" tone="textSecondary" style={styles.heading}>
        {t(HEADING[field])}
      </AppText>
      {field === 'rir' ? (
        <View style={styles.chips}>
          <RirChips value={rir} onChange={onRirChange} />
        </View>
      ) : (
        <NumericKeypad
          value={draft}
          onChange={change}
          onDone={onDone}
          allowDecimal={field === 'weight'}
          maxFractionDigits={field === 'weight' ? 2 : 0}
        />
      )}
    </View>
  );
}

/** A rep count is whole. A half-typed `6,` parses to null, which is "not recorded" and not a zero. */
function wholeNumber(value: number | null): number | null {
  return value === null ? null : Math.trunc(value);
}

const styles = StyleSheet.create({
  editor: { borderTopWidth: sizes.edgeHairline },
  heading: { paddingHorizontal: space[4], paddingTop: space[2] },
  chips: { padding: space[2] },
});
