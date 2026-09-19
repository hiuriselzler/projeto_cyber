import { StyleSheet, View } from 'react-native';

import type { CatalogExercise } from '@/db/catalog';
import type { LiveExercise, LiveSet } from '@/db/strength';
import { AppText, Button, SetRow, space, useT, type SetRowField } from '@/ui';

import { exerciseLabel } from './exerciseName';

export interface ExerciseBlockProps {
  readonly exercise: LiveExercise;
  readonly catalog: CatalogExercise | undefined;
  /** What this exercise looked like last time, by set index (FR-2.12). */
  readonly previous: Map<number, LiveSet>;
  readonly editing: { readonly setLogId: string; readonly field: SetRowField } | null;
  readonly onEdit: (setLogId: string, field: SetRowField) => void;
  readonly onToggleComplete: (setLogId: string, isCompleted: boolean) => void;
  readonly onAddSet: () => void;
  /** Where each set row sits inside this block, so the screen can scroll it clear of the keypad. */
  readonly onRowLayout: (setLogId: string, top: number, height: number) => void;
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
}: ExerciseBlockProps) {
  const t = useT();

  return (
    <View style={styles.block}>
      <AppText variant="title">{catalog === undefined ? '' : exerciseLabel(catalog, t)}</AppText>

      {exercise.sets.map((set) => {
        const last = previous.get(set.setIndex);
        return (
          <View
            key={set.id}
            onLayout={(event) => onRowLayout(set.id, event.nativeEvent.layout.y, event.nativeEvent.layout.height)}
          >
            <SetRow
              setNumber={set.setIndex}
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
});
