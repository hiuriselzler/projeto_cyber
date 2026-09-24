import { StyleSheet, View } from 'react-native';

import {
  AppText,
  keypadShortDistanceToMetres,
  keypadWeightToKilograms,
  NumericKeypad,
  parseDecimalInput,
  RirChips,
  sizes,
  space,
  timeDigitsToSeconds,
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
  time: 'workout.edit_duration',
  distance: 'workout.edit_distance',
};

/**
 * How the keypad behaves for each field it serves. A weight takes two decimals; a distance one — a tenth of a metre or
 * a foot is as fine as anyone measures a carry; a rep count and a time take none. A time is typed as digits filling
 * from the right (`130` is 1:30), so four digits reach 99:59 (task 004 stage 5c).
 */
const KEYPAD: Record<Exclude<SetRowField, 'rir'>, { readonly allowDecimal: boolean; readonly maxFractionDigits: number }> = {
  weight: { allowDecimal: true, maxFractionDigits: 2 },
  distance: { allowDecimal: true, maxFractionDigits: 1 },
  reps: { allowDecimal: false, maxFractionDigits: 0 },
  time: { allowDecimal: false, maxFractionDigits: 0 },
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
    onValueChange(valueOf(field, next, unitSystem));
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
          allowDecimal={KEYPAD[field].allowDecimal}
          maxFractionDigits={KEYPAD[field].maxFractionDigits}
        />
      )}
    </View>
  );
}

/** What the keypad's text means, in SI (INV-01): kilograms, metres, seconds or a whole rep count. */
function valueOf(field: SetRowField, text: string, unitSystem: Parameters<typeof keypadWeightToKilograms>[1]): number | null {
  if (field === 'weight') return keypadWeightToKilograms(text, unitSystem);
  if (field === 'distance') return keypadShortDistanceToMetres(text, unitSystem);
  if (field === 'time') return timeDigitsToSeconds(text);
  return wholeNumber(parseDecimalInput(text));
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
