import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { formatWeight } from '../format/quantities';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { spokenQuantity } from '../i18n/spoken';
import { useTheme } from '../theme/ThemeProvider';
import { radii, sizes, space } from '../tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface PreviousSet {
  readonly weightKg: number | null;
  readonly reps: number | null;
  readonly rir: number | null;
}

export type SetRowField = 'weight' | 'reps' | 'rir';

export interface SetRowProps {
  readonly setNumber: number;
  /** Stored SI; shown in the user's unit system (INV-01). */
  readonly weightKg: number | null;
  readonly reps: number | null;
  /** Null is "not recorded", shown and spoken as such — never as 0 (INV-03). */
  readonly rir: number | null;
  readonly completed: boolean;
  /** Last time's performance, always visible and never a tap away (07 §6). */
  readonly previous?: PreviousSet | null;
  /** The field the keypad or the RIR chips are editing, if any. */
  readonly editing?: SetRowField | null;
  readonly onEdit: (field: SetRowField) => void;
  readonly onToggleComplete: () => void;
}

const NONE = '—';

/**
 * The set row — the single most important component (07 §6). `[weight] [reps] [RIR] [✓]` at 56 dp, with last time
 * underneath. A screen reader meets it as one sentence — "Set 3, 40 kilograms, 6 reps, RIR 2, incomplete" — with an
 * action for each field, and double-tap completing the set.
 */
export function SetRow({
  setNumber,
  weightKg,
  reps,
  rir,
  completed,
  previous = null,
  editing = null,
  onEdit,
  onToggleComplete,
}: SetRowProps) {
  const { colors } = useTheme();
  const { locale, unitSystem } = useLocale();
  const t = useT();

  const weight = weightKg === null ? null : formatWeight(weightKg, unitSystem, locale);
  const sentence = t('a11y.set_row', {
    number: setNumber,
    weight: weight === null ? t('a11y.weight_none') : spokenQuantity(t, weight),
    reps: reps === null ? t('a11y.reps_none') : t('a11y.reps', { count: reps }),
    rir: rir === null ? t('a11y.rir_none') : t('a11y.rir', { rir }),
    status: completed ? t('a11y.set_complete') : t('a11y.set_incomplete'),
  });
  const toggleLabel = completed ? t('a11y.mark_incomplete') : t('a11y.mark_complete');

  const onAccessibilityAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'activate') onToggleComplete();
    if (nativeEvent.actionName === 'editWeight') onEdit('weight');
    if (nativeEvent.actionName === 'editReps') onEdit('reps');
    if (nativeEvent.actionName === 'editRir') onEdit('rir');
  };

  return (
    <View
      accessible
      accessibilityLabel={sentence}
      accessibilityState={{ checked: completed }}
      accessibilityActions={[
        { name: 'activate', label: toggleLabel },
        { name: 'editWeight', label: t('a11y.edit_weight') },
        { name: 'editReps', label: t('a11y.edit_reps') },
        { name: 'editRir', label: t('a11y.edit_rir') },
      ]}
      onAccessibilityAction={onAccessibilityAction}
      style={[
        styles.row,
        {
          backgroundColor: editing === null ? colors.bgSurface : colors.bgElevated,
          borderColor: editing === null ? colors.borderSubtle : colors.accent,
          borderWidth: editing === null ? sizes.edgeHairline : sizes.edgeSelected,
        },
      ]}
    >
      <View style={styles.numbers}>
        <View style={styles.line}>
          <AppText variant="metric" tone="textSecondary" style={styles.setNumber}>
            {setNumber}
          </AppText>

          <Field testID="set-row-weight" active={editing === 'weight'} onPress={() => onEdit('weight')}>
            <AppText variant="metricLg">{weight === null ? NONE : weight.text}</AppText>
            {weight === null ? null : (
              <AppText variant="metric" tone="textSecondary">
                {t(`unit.${weight.unit}`)}
              </AppText>
            )}
          </Field>

          <AppText variant="metric" tone="textSecondary">
            ×
          </AppText>

          <Field testID="set-row-reps" active={editing === 'reps'} onPress={() => onEdit('reps')}>
            <AppText variant="metricLg">{reps === null ? NONE : String(reps)}</AppText>
          </Field>

          <Field testID="set-row-rir" active={editing === 'rir'} onPress={() => onEdit('rir')}>
            <AppText variant="metric" tone={rir === null ? 'textMuted' : 'textPrimary'}>
              {rir === null ? t('ui.set_row.rir_blank') : t('ui.set_row.rir', { rir })}
            </AppText>
          </Field>
        </View>

        {previous === null ? null : (
          <AppText variant="caption" tone="textMuted" style={styles.previous}>
            {t('ui.set_row.previous', {
              weight: previous.weightKg === null ? NONE : formatWeight(previous.weightKg, unitSystem, locale).text,
              reps: previous.reps === null ? NONE : String(previous.reps),
              rir: previous.rir === null ? '' : String(previous.rir),
              rir_recorded: previous.rir === null ? 'no' : 'yes',
            })}
          </AppText>
        )}
      </View>

      <Pressable
        testID="set-row-complete"
        onPress={onToggleComplete}
        style={[
          styles.complete,
          {
            backgroundColor: completed ? colors.success : 'transparent',
            borderColor: completed ? colors.success : colors.borderStrong,
          },
        ]}
      >
        {completed ? <Icon name="check" color={colors.textOnAccent} /> : null}
      </Pressable>
    </View>
  );
}

function Field({ testID, active, onPress, children }: { testID: string; active: boolean; onPress: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[
        styles.field,
        { borderColor: active ? colors.accent : 'transparent', borderWidth: active ? sizes.edgeSelected : sizes.edgeHairline },
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * **The ✓ is a column, not a word in the sentence.**
   *
   * It used to sit inside `line` with `marginLeft: 'auto'`, so it took part in the wrap — and on a Galaxy S21 FE at
   * font scale **0.86**, below the default, it lost: the numbers ran to ~259 dp, the ✓ needs 56 plus an 8 dp gap, and
   * the row's 336 dp of inner width left 61. **It broke to a second line over three dp**, with a third of the row
   * empty beside it (task 004 stage 3 device pass, 2026-09-19).
   *
   * Nothing truncated and every target stayed 56 dp, so the old layout was behaving as written — but
   * [07 §6](../../../../../docs/07-brand-and-ui.md) pictures *one line*, and a row that breaks while a third of it is
   * unused is not the picture failing, it is the layout. So the layout gave way: the ✓ is now a fixed sibling that
   * never wraps, and the numbers reflow inside the space that is left.
   *
   * What this buys at the other end of the range, measured on the same phone: at **200 %** the numbers wrap to two
   * lines and the ✓ stays anchored beside them, vertically centred and still a full target — reflowed, never
   * truncated, which is what the task's device criterion asks for.
   */
  row: {
    minHeight: sizes.targetWorkout,
    borderRadius: radii.md,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: space[2],
  },
  // Takes the width the ✓ does not, and wraps inside it. `flex: 1` rather than a width: the numbers grow with the
  // font scale and must never push the ✓ off the row.
  numbers: { flex: 1 },
  /**
   * **The numbers still wrap at default font scale, and that is an open design question, not a bug left lying.**
   *
   * Measured on the S21 FE at scale 1.0: the row has 312 dp of inner width, the ✓ and its gap take 64, and the
   * numbers need about 250 against the 248 left — so `RIR 7` drops to a second line by roughly two dp. Tightening
   * this gap to `space[1]` does win the line at 0.86 and still loses it at 1.0, so it was tried and reverted rather
   * than kept: cramping the most important component in the app to chase two dp it does not win is the wrong trade.
   *
   * And the arithmetic above is for *short* values. The realistic heavy set — `100 kg × 12 RIR 10` — is wider still
   * and wraps at every scale, so "always one line" is not reachable on a 360 dp phone while the numerals stay at the
   * size INV-24 wants them. What to give up for it — the leading set number, the `×`, the unit label — is a call for
   * [07 §6](../../../../../docs/07-brand-and-ui.md) to make, and it is recorded as an open question there.
   */
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[2] },
  setNumber: { minWidth: sizes.icon },
  field: {
    minHeight: sizes.targetWorkout,
    minWidth: sizes.targetMin,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    columnGap: space[1],
    paddingHorizontal: space[1],
    paddingTop: space[2],
    borderRadius: radii.md,
  },
  complete: {
    width: sizes.targetWorkout,
    height: sizes.targetWorkout,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: sizes.edgeSelected,
  },
  previous: { paddingLeft: sizes.icon + space[2] },
});
