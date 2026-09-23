import { StyleSheet, View } from 'react-native';

import type { CatalogExercise } from '@/db/catalog';
import type { LiveExercise, LiveSet } from '@/db/strength';
import { AppText, Button, SetRow, space, useT, type SetRowField } from '@/ui';

import { exerciseLabel } from './exerciseName';
import { targetSummary } from './targetText';

export interface ExerciseBlockProps {
  readonly exercise: LiveExercise;
  readonly catalog: CatalogExercise | null;
  /** What this exercise looked like last time, by set index (FR-2.12). */
  readonly previous: Map<number, LiveSet>;
  readonly editing: { readonly setLogId: string; readonly field: SetRowField } | null;
  readonly onEdit: (setLogId: string, field: SetRowField) => void;
  readonly onToggleComplete: (setLogId: string, isCompleted: boolean) => void;
  readonly onAddSet: () => void;
  /** Where each set row sits inside this block, so the screen can scroll it clear of the keypad. */
  readonly onRowLayout: (setLogId: string, top: number, height: number) => void;
  /** Open a set's type choice — from its number, a visible control (07 §5). Omitted, the number is plain text. */
  readonly onChangeType?: (setLogId: string) => void;
  /** Open this exercise's options — rest, order, superset, removal. Omitted, no button is drawn. */
  readonly onOptions?: () => void;
}

/** One exercise in a live workout: its name, its set rows, and the way to add another set. */
export function ExerciseBlock({
  exercise,
  catalog,
  previous,
  editing,
  onEdit,
  onToggleComplete,
  onAddSet,
  onRowLayout,
  onChangeType,
  onOptions,
}: ExerciseBlockProps) {
  const t = useT();
  // What the routine carried onto this session (03 §4). The target RIR is shown here, beside the sets, and never written
  // into one — a RIR the user did not choose is not a RIR they logged (INV-03, task 004 § Stages, decision 3).
  const targets = targetSummary(exercise, (key, options) => t(key, options));

  return (
    <View style={styles.block}>
      <View style={styles.heading}>
        <AppText variant="title" style={styles.name}>
          {catalog === null ? '' : exerciseLabel(catalog, t)}
        </AppText>
        {onOptions === undefined ? null : (
          <Button variant="quiet" label={t('workout.exercise_options')} onPress={onOptions} />
        )}
      </View>
      {exercise.supersetGroup === null ? null : (
        // A word, not only a colour: the grouping must survive a colour-blind reader (INV-24).
        <AppText variant="caption" tone="accent">
          {t('workout.superset')}
        </AppText>
      )}
      {targets === null ? null : (
        <AppText variant="caption" tone="textMuted">
          {t('workout.target', { summary: targets })}
        </AppText>
      )}

      {exercise.sets.map((set) => {
        const last = previous.get(set.setIndex);
        return (
          <View
            key={set.id}
            onLayout={(event) => onRowLayout(set.id, event.nativeEvent.layout.y, event.nativeEvent.layout.height)}
          >
            <SetRow
              setNumber={set.setIndex}
              setType={set.setType}
              onChangeType={onChangeType === undefined ? undefined : () => onChangeType(set.id)}
              weightKg={set.weightKg}
              reps={set.reps}
              rir={set.rir}
              completed={set.isCompleted}
              previous={last === undefined ? null : { weightKg: last.weightKg, reps: last.reps, rir: last.rir }}
              editing={editing?.setLogId === set.id ? editing.field : null}
              onEdit={(field) => onEdit(set.id, field)}
              onToggleComplete={() => onToggleComplete(set.id, !set.isCompleted)}
            />
          </View>
        );
      })}

      <Button variant="secondary" label={t('workout.add_set')} onPress={onAddSet} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[2] },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  name: { flexShrink: 1 },
});
