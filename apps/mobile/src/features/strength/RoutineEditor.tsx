import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { readExercise } from '@/db/catalog';
import {
  addRoutineExercise,
  moveItem,
  readRoutine,
  removeRoutineExercise,
  reorderRoutineExercises,
  toggleRoutineSuperset,
  updateRoutineExerciseTargets,
  type RoutineExercise,
} from '@/db/routines';
import { AppText, Button, EmptyState, radii, Screen, sizes, space, useT, useTheme } from '@/ui';

import { exerciseLabel } from './exerciseName';
import { ExercisePicker } from './ExercisePicker';
import { RoutineForm } from './RoutineForm';
import { TargetsSheet } from './TargetsSheet';
import { targetSummary } from './targetText';
import { useSignedInUserId } from './useLiveWorkout';

/**
 * One routine, edited — its exercises, their order, their supersets and their targets (FR-2.5, FR-2.6).
 *
 * **Reordering is two buttons, not a drag.** A drag is a precision gesture with no visible alternative, which 07 §5
 * rules out mid-workout and which this screen has no reason to reach for either: "move up" and "move down" are
 * full-size targets that a screen reader can reach and a thumb cannot miss.
 *
 * A superset is made by linking an exercise to the one below it, so a group is always a run of neighbours — the only
 * shape the live workout can alternate through (FR-2.6).
 */
export function RoutineEditor({ routineId }: { readonly routineId: string }) {
  const t = useT();
  const { colors } = useTheme();
  const userId = useSignedInUserId();

  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [editingTargets, setEditingTargets] = useState<RoutineExercise | null>(null);
  /** Bumped after every write, so the routine re-reads from SQLite rather than being patched in memory. */
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((current) => current + 1);

  const routine = useMemo(() => {
    void revision;
    return userId === null ? null : readRoutine(userId, routineId);
  }, [userId, routineId, revision]);

  // `readExercise` rather than the live catalog list: an exercise hidden since it was added must still be named here,
  // or the routine shows a blank row for something that is plainly still in it (INV-11).
  const labels = useMemo(() => {
    const byId = new Map<string, string>();
    if (userId === null || routine === null) return byId;
    for (const exercise of routine.exercises) {
      const row = readExercise(userId, exercise.exerciseId);
      byId.set(exercise.exerciseId, row === null ? '' : exerciseLabel(row, t));
    }
    return byId;
  }, [userId, routine, t]);

  if (userId === null || routine === null) {
    return <Screen />;
  }

  const ids = routine.exercises.map((exercise) => exercise.id);

  return (
    <Screen>
      <View style={styles.header}>
        {/* The routine's name and folder are the user's own words (INV-27). */}
        <View style={styles.headerText}>
          <AppText variant="title">{routine.name}</AppText>
          {routine.folder === null ? null : (
            <AppText variant="caption" tone="textMuted">
              {routine.folder}
            </AppText>
          )}
        </View>
        <Button variant="secondary" label={t('routine.form_edit_title')} onPress={() => setRenaming(true)} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {routine.exercises.length === 0 ? (
          <EmptyState title={t('workout.empty_title')} body={t('routine.exercises_empty')} />
        ) : (
          routine.exercises.map((exercise, index) => {
            const linkedBelow =
              exercise.supersetGroup !== null && routine.exercises[index + 1]?.supersetGroup === exercise.supersetGroup;
            const label = labels.get(exercise.exerciseId) ?? '';
            return (
              <View
                key={exercise.id}
                style={[
                  styles.item,
                  { borderColor: exercise.supersetGroup === null ? colors.borderSubtle : colors.accent },
                ]}
              >
                <AppText>{label}</AppText>
                {exercise.supersetGroup === null ? null : (
                  // A word as well as the accent border: the grouping is never carried by colour alone (INV-24).
                  <AppText variant="caption" tone="accent">
                    {t('workout.superset')}
                  </AppText>
                )}
                <AppText variant="caption" tone="textMuted">
                  {targetSummary(exercise, (key, options) => t(key, options)) ?? t('routine.targets_none')}
                </AppText>

                <View style={styles.actions}>
                  <Button variant="secondary" label={t('routine.targets')} onPress={() => setEditingTargets(exercise)} />
                  <Button
                    variant="quiet"
                    label={t('routine.move_up')}
                    disabled={index === 0}
                    onPress={() => {
                      reorderRoutineExercises({ userId, routineId, orderedIds: moveItem(ids, index, index - 1), now: Date.now() });
                      refresh();
                    }}
                  />
                  <Button
                    variant="quiet"
                    label={t('routine.move_down')}
                    disabled={index === ids.length - 1}
                    onPress={() => {
                      reorderRoutineExercises({ userId, routineId, orderedIds: moveItem(ids, index, index + 1), now: Date.now() });
                      refresh();
                    }}
                  />
                  {index === ids.length - 1 ? null : (
                    <Button
                      variant="quiet"
                      label={linkedBelow ? t('routine.superset_unlink') : t('routine.superset_link')}
                      onPress={() => {
                        toggleRoutineSuperset({ userId, routineId, index, now: Date.now() });
                        refresh();
                      }}
                    />
                  )}
                  <Button
                    variant="quiet"
                    label={t('routine.remove')}
                    onPress={() => {
                      removeRoutineExercise({ userId, routineId, routineExerciseId: exercise.id, now: Date.now() });
                      refresh();
                    }}
                  />
                </View>
              </View>
            );
          })
        )}

        <Button variant="secondary" label={t('routine.add_exercise')} onPress={() => setPicking(true)} />
      </ScrollView>

      <ExercisePicker
        visible={picking}
        userId={userId}
        onClose={() => setPicking(false)}
        onPick={(exerciseId) => {
          setPicking(false);
          void addRoutineExercise({ userId, routineId, exerciseId, now: Date.now() }).then(refresh);
        }}
      />

      {editingTargets === null ? null : (
        <TargetsSheet
          title={labels.get(editingTargets.exerciseId) ?? t('routine.targets_title')}
          targets={editingTargets}
          onClose={() => setEditingTargets(null)}
          onSave={(targets) => {
            updateRoutineExerciseTargets({ userId, routineExerciseId: editingTargets.id, targets, now: Date.now() });
            setEditingTargets(null);
            refresh();
          }}
        />
      )}

      {renaming ? (
        <RoutineForm
          userId={userId}
          target={{ kind: 'edit', routineId, name: routine.name, folder: routine.folder }}
          onClose={() => setRenaming(false)}
          onSaved={() => {
            setRenaming(false);
            refresh();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], padding: space[4] },
  headerText: { flex: 1 },
  list: { padding: space[4], gap: space[3], paddingBottom: space[12] },
  item: { gap: space[1], padding: space[3], borderWidth: sizes.edgeHairline, borderRadius: radii.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], paddingTop: space[1] },
});
