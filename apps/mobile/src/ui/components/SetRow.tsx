import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import type { Locale } from '../format/number';
import {
  formatDuration,
  formatShortDistance,
  formatWeight,
  type FormattedQuantity,
  type UnitSystem,
} from '../format/quantities';
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
  readonly durationS?: number | null;
  readonly distanceM?: number | null;
}

export type SetRowField = 'weight' | 'reps' | 'rir' | 'time' | 'distance';

/** FR-2.9. Only `working` and `amrap` count (INV-04) — a judgement the core makes, never this component. */
export type SetRowType = 'warmup' | 'working' | 'drop' | 'backoff' | 'amrap';

/** What the exercise logs (FR-2.3) — and so which fields the row draws (task 004 stage 5c). */
export type SetRowTracking = 'weight_reps' | 'reps_only' | 'duration' | 'distance_duration';

export interface SetRowProps {
  readonly setNumber: number;
  /**
   * A working set shows its number; any other type shows its letter there instead — `W`, `D`, `B`, `A` in English —
   * and says its type aloud. A letter, never a colour alone (INV-24, 07 §6).
   */
  readonly setType?: SetRowType;
  /**
   * Which fields this row has (07 §6): weight × reps with RIR; reps with RIR; a time; or weight · distance · time. A
   * hold and a carry have **no RIR** — there are no reps to hold in reserve, so it stays NULL (INV-03).
   */
  readonly tracking?: SetRowTracking;
  /** Stored SI; shown in the user's unit system (INV-01). */
  readonly weightKg: number | null;
  readonly reps: number | null;
  /** Null is "not recorded", shown and spoken as such — never as 0 (INV-03). */
  readonly rir: number | null;
  /** Seconds, shown as m:ss. */
  readonly durationS?: number | null;
  /** Metres, shown in m or ft. */
  readonly distanceM?: number | null;
  readonly completed: boolean;
  /** Last time's performance, always visible and never a tap away (07 §6). */
  readonly previous?: PreviousSet | null;
  /** The field the keypad or the RIR chips are editing, if any. */
  readonly editing?: SetRowField | null;
  readonly onEdit: (field: SetRowField) => void;
  readonly onToggleComplete: () => void;
  /**
   * Open the set-type choice. The set number is the visible control for it, and long-press is a shortcut to the same
   * place — never a swipe, and never a gesture with no visible alternative (07 §5). Omitted, the number is plain text.
   */
  readonly onChangeType?: () => void;
}

const NONE = '—';

/** Which fields each tracking mode draws, in order (task 004 § Stages, 5c decision 1). */
const FIELDS: Record<SetRowTracking, readonly SetRowField[]> = {
  weight_reps: ['weight', 'reps', 'rir'],
  reps_only: ['reps', 'rir'],
  duration: ['time'],
  distance_duration: ['weight', 'distance', 'time'],
};

/**
 * The sentence a screen reader hears, per mode. A switch rather than a lookup object: a property literally named
 * `duration` holding a literal is what the INV-23 fence reads as an animation timing, and a tracking mode is not one.
 */
function sentenceKey(tracking: SetRowTracking): string {
  switch (tracking) {
    case 'weight_reps':
      return 'a11y.set_row';
    case 'reps_only':
      return 'a11y.set_row_reps_only';
    case 'duration':
      return 'a11y.set_row_duration';
    case 'distance_duration':
      return 'a11y.set_row_distance';
  }
}

const ACTIONS: Record<SetRowField, { readonly name: string; readonly label: string }> = {
  weight: { name: 'editWeight', label: 'a11y.edit_weight' },
  reps: { name: 'editReps', label: 'a11y.edit_reps' },
  rir: { name: 'editRir', label: 'a11y.edit_rir' },
  time: { name: 'editDuration', label: 'a11y.edit_duration' },
  distance: { name: 'editDistance', label: 'a11y.edit_distance' },
};

/** `t`, narrowed to what the helpers below need. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

/** A time as a screen reader says it: "1 minute 30 seconds", or "45 seconds". */
function spokenDuration(t: Translate, seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  if (minutes === 0) return t('a11y.duration_seconds', { count: rest });
  if (rest === 0) return t('a11y.duration_minutes', { count: minutes });
  return t('a11y.duration_both', {
    minutes: t('a11y.duration_minutes', { count: minutes }),
    seconds: t('a11y.duration_seconds', { count: rest }),
  });
}

/** A quantity as written in a caption: its number and its translated unit (INV-27). */
function written(t: Translate, quantity: FormattedQuantity): string {
  return `${quantity.text} ${t(`unit.${quantity.unit}`)}`;
}

/**
 * Last time, in one caption. A weight × reps row keeps its original sentence — "40 kg × 6 @2 last time" — and every
 * other mode lists what it measures, separated by a dot, inside the same "… last time" frame each language words.
 */
function previousText(
  tracking: SetRowTracking,
  previous: PreviousSet,
  t: Translate,
  unitSystem: UnitSystem,
  locale: Locale,
): string {
  if (tracking === 'weight_reps') {
    return t('ui.set_row.previous', {
      weight: previous.weightKg === null ? NONE : formatWeight(previous.weightKg, unitSystem, locale).text,
      reps: previous.reps === null ? NONE : String(previous.reps),
      rir: previous.rir === null ? '' : String(previous.rir),
      rir_recorded: previous.rir === null ? 'no' : 'yes',
    });
  }
  const parts: string[] = [];
  if (tracking === 'reps_only') {
    parts.push(
      previous.reps === null ? NONE : previous.rir === null ? String(previous.reps) : `${String(previous.reps)} @${String(previous.rir)}`,
    );
  }
  if (tracking === 'distance_duration') {
    if (previous.weightKg !== null) parts.push(written(t, formatWeight(previous.weightKg, unitSystem, locale)));
    const distanceM = previous.distanceM ?? null;
    parts.push(distanceM === null ? NONE : written(t, formatShortDistance(distanceM, unitSystem, locale)));
  }
  if (tracking === 'duration' || tracking === 'distance_duration') {
    const durationS = previous.durationS ?? null;
    if (durationS !== null || tracking === 'duration') parts.push(durationS === null ? NONE : formatDuration(durationS));
  }
  return t('ui.set_row.previous_parts', { parts: parts.join(' · ') });
}

/**
 * The set row — the single most important component (07 §6). At 56 dp, with last time underneath. A screen reader
 * meets it as one sentence — "Set 3, 40 kilograms, 6 reps, RIR 2, incomplete", or "Set 1, 45 seconds, complete" for a
 * hold — with an action for each field its mode has, and double-tap completing the set.
 */
export function SetRow({
  setNumber,
  setType = 'working',
  tracking = 'weight_reps',
  weightKg,
  reps,
  rir,
  durationS = null,
  distanceM = null,
  completed,
  previous = null,
  editing = null,
  onEdit,
  onToggleComplete,
  onChangeType,
}: SetRowProps) {
  const { colors } = useTheme();
  const { locale, unitSystem } = useLocale();
  const t = useT();
  const say: Translate = (key, options) => t(key, options);

  const fields = FIELDS[tracking];
  const weight = weightKg === null ? null : formatWeight(weightKg, unitSystem, locale);
  const distance = distanceM === null ? null : formatShortDistance(distanceM, unitSystem, locale);

  const sentence = t(sentenceKey(tracking), {
    kind: setType === 'working' ? 'working' : 'other',
    type: t(`set_type.${setType}`),
    number: setNumber,
    weight: weight === null ? t('a11y.weight_none') : spokenQuantity(t, weight),
    reps: reps === null ? t('a11y.reps_none') : t('a11y.reps', { count: reps }),
    rir: rir === null ? t('a11y.rir_none') : t('a11y.rir', { rir }),
    duration: durationS === null ? t('a11y.duration_none') : spokenDuration(say, durationS),
    distance: distance === null ? t('a11y.distance_none') : spokenQuantity(t, distance),
    status: completed ? t('a11y.set_complete') : t('a11y.set_incomplete'),
  });
  const toggleLabel = completed ? t('a11y.mark_incomplete') : t('a11y.mark_complete');

  const onAccessibilityAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (nativeEvent.actionName === 'activate') onToggleComplete();
    if (nativeEvent.actionName === 'changeType') onChangeType?.();
    for (const field of fields) {
      if (nativeEvent.actionName === ACTIONS[field].name) onEdit(field);
    }
  };

  const marker = setType === 'working' ? String(setNumber) : t(`ui.set_row.type_letter.${setType}`);

  return (
    <View
      accessible
      accessibilityLabel={sentence}
      accessibilityState={{ checked: completed }}
      accessibilityActions={[
        { name: 'activate', label: toggleLabel },
        ...fields.map((field) => ({ name: ACTIONS[field].name, label: t(ACTIONS[field].label) })),
        ...(onChangeType === undefined ? [] : [{ name: 'changeType', label: t('a11y.change_set_type') }]),
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
          <Pressable
            testID="set-row-type"
            disabled={onChangeType === undefined}
            onPress={onChangeType}
            onLongPress={onChangeType}
            // The marker keeps its narrow column so the numbers are not pushed onto a second line (07 §6's open
            // question); the slop is what makes it a full-size target anyway.
            hitSlop={{ top: space[2], bottom: space[2], left: space[2], right: space[1] }}
            style={styles.setNumber}
          >
            <AppText variant="metric" tone={setType === 'working' ? 'textSecondary' : 'accent'}>
              {marker}
            </AppText>
          </Pressable>

          {fields.map((field) => (
            <FieldGroup key={field}>
              {/* `×` joins weight and reps only: a carry's fields are separate measures, not a product. */}
              {tracking === 'weight_reps' && field === 'reps' ? (
                <AppText variant="metric" tone="textSecondary">
                  ×
                </AppText>
              ) : null}
              <Field testID={`set-row-${field}`} active={editing === field} onPress={() => onEdit(field)}>
                {field === 'weight' ? <Quantity value={weight} /> : null}
                {field === 'distance' ? <Quantity value={distance} /> : null}
                {field === 'reps' ? (
                  <>
                    <AppText variant="metricLg">{reps === null ? NONE : String(reps)}</AppText>
                    {/* Alone, a bare number could be anything; beside a weight and `×` it is plainly reps. */}
                    {tracking === 'reps_only' ? (
                      <AppText variant="metric" tone="textSecondary">
                        {t('ui.set_row.reps_unit', { count: reps ?? 0 })}
                      </AppText>
                    ) : null}
                  </>
                ) : null}
                {field === 'time' ? (
                  <AppText variant="metricLg">{durationS === null ? NONE : formatDuration(durationS)}</AppText>
                ) : null}
                {field === 'rir' ? (
                  <AppText variant="metric" tone={rir === null ? 'textMuted' : 'textPrimary'}>
                    {rir === null ? t('ui.set_row.rir_blank') : t('ui.set_row.rir', { rir })}
                  </AppText>
                ) : null}
              </Field>
            </FieldGroup>
          ))}
        </View>

        {previous === null ? null : (
          <AppText variant="caption" tone="textMuted" style={styles.previous}>
            {previousText(tracking, previous, say, unitSystem, locale)}
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

/** A number with its unit one step smaller (07 §4), or a dash when nothing is recorded. */
function Quantity({ value }: { readonly value: FormattedQuantity | null }) {
  const t = useT();
  return (
    <>
      <AppText variant="metricLg">{value === null ? NONE : value.text}</AppText>
      {value === null ? null : (
        <AppText variant="metric" tone="textSecondary">
          {t(`unit.${value.unit}`)}
        </AppText>
      )}
    </>
  );
}

/** Keeps a field and the `×` before it on one line when the row wraps. */
function FieldGroup({ children }: { readonly children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
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
  group: { flexDirection: 'row', alignItems: 'center', columnGap: space[2] },
  setNumber: { minWidth: sizes.icon, minHeight: sizes.targetWorkout, justifyContent: 'center' },
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
