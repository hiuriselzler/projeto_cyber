import { StyleSheet, View } from 'react-native';

import { AppText, Button, Chip, formatDuration, Sheet, space, useT } from '@/ui';

import { restChoices } from './targetsDraft';

interface ExerciseOptionsSheetProps {
  readonly visible: boolean;
  /** Already resolved: translated for a global, exactly as typed for the user's own (INV-27). */
  readonly title: string;
  readonly restSeconds: number | null;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  /** Whether this exercise is already supersetted with the one below it. */
  readonly linkedBelow: boolean;
  readonly onRest: (restSeconds: number | null) => void;
  readonly onMove: (delta: -1 | 1) => void;
  readonly onToggleSuperset: () => void;
  readonly onRemove: () => void;
  readonly onClose: () => void;
}

/**
 * One exercise of a live workout, rearranged — FR-2.8's remove and reorder, FR-2.6's superset, and its rest.
 *
 * Kept off the exercise block itself: mid-workout the block's job is its set rows, and five rarely-used buttons around
 * them would push the next set off the screen. The sheet is one visible "Options" button away (07 §5).
 *
 * The rest set here lasts for the rest of this workout and touches no routine (03 §4): a session copies its targets
 * at the start precisely so that changing one never reaches back into the other.
 */
export function ExerciseOptionsSheet({
  visible,
  title,
  restSeconds,
  isFirst,
  isLast,
  linkedBelow,
  onRest,
  onMove,
  onToggleSuperset,
  onRemove,
  onClose,
}: ExerciseOptionsSheetProps) {
  const t = useT();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.body}>
        <View style={styles.field}>
          <AppText variant="label" tone="textSecondary">
            {t('workout.rest')}
          </AppText>
          <AppText variant="caption" tone="textMuted">
            {t('workout.rest_hint')}
          </AppText>
          <View style={styles.row}>
            <Chip label={t('routine.rest_off')} role="radio" selected={restSeconds === null} onPress={() => onRest(null)} />
            {restChoices(restSeconds).map((seconds) => (
              <Chip
                key={seconds}
                label={formatDuration(seconds)}
                role="radio"
                selected={restSeconds === seconds}
                onPress={() => onRest(seconds)}
              />
            ))}
          </View>
        </View>

        <View style={styles.row}>
          <Button variant="secondary" label={t('workout.move_up')} disabled={isFirst} onPress={() => onMove(-1)} />
          <Button variant="secondary" label={t('workout.move_down')} disabled={isLast} onPress={() => onMove(1)} />
        </View>
        {isLast ? null : (
          <Button
            variant="secondary"
            label={linkedBelow ? t('workout.superset_unlink') : t('workout.superset_link')}
            onPress={onToggleSuperset}
          />
        )}
        <Button variant="quiet" label={t('workout.remove_exercise')} onPress={onRemove} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[3], paddingBottom: space[4] },
  field: { gap: space[1] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
