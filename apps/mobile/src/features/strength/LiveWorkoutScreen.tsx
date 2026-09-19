import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { listExercises } from '@/db/catalog';
import { readPreviousPerformance, type SetField } from '@/db/strength';
import {
  AppText,
  Button,
  EmptyState,
  offsetToReveal,
  Screen,
  space,
  useLocale,
  useT,
  weightForKeypad,
  type SetRowField,
} from '@/ui';

import { ExerciseBlock } from './ExerciseBlock';
import { ExercisePicker } from './ExercisePicker';
import { SetEditor } from './SetEditor';
import { useLiveWorkout, useSignedInUserId } from './useLiveWorkout';

/** Which column of `set_logs` each editable field of the row writes. */
const COLUMN: Record<SetRowField, SetField> = { weight: 'weightKg', reps: 'reps', rir: 'rir' };

interface Editing {
  readonly setLogId: string;
  readonly field: SetRowField;
}

/**
 * The live workout — task 004's core loop, and the screen the whole project is judged on (07 §6).
 *
 * Nothing here holds the only copy of anything: every tap writes to SQLite and the screen re-reads (INV-09). The
 * keypad sits over the list rather than in it, and the list scrolls so the row being edited is never underneath it —
 * the geometry is `offsetToReveal`, written with the keypad in task 011 and used here for the first time.
 */
export function LiveWorkoutScreen() {
  const t = useT();
  const { locale, unitSystem } = useLocale();
  const userId = useSignedInUserId();
  const workout = useLiveWorkout(userId);

  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState(false);

  const scroll = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const viewportHeight = useRef(0);
  const editorHeight = useRef(0);
  // Where each set row sits in the list's content coordinates: its block's top plus its own offset within the block.
  const blockTops = useRef(new Map<string, number>());
  const rowBoxes = useRef(new Map<string, { blockId: string; top: number; height: number }>());

  const reveal = useCallback((setLogId: string) => {
    const box = rowBoxes.current.get(setLogId);
    const blockTop = box === undefined ? undefined : blockTops.current.get(box.blockId);
    if (box === undefined || blockTop === undefined) return;
    const rowTop = blockTop + box.top;
    scroll.current?.scrollTo({
      y: offsetToReveal({
        rowTop,
        rowBottom: rowTop + box.height,
        scrollOffset: scrollOffset.current,
        viewportHeight: viewportHeight.current,
        keypadHeight: editorHeight.current,
        margin: space[2],
      }),
      animated: true,
    });
  }, []);

  const startEditing = useCallback(
    (setLogId: string, field: SetRowField, weightKg: number | null, reps: number | null) => {
      setEditing({ setLogId, field });
      setDraft(
        field === 'weight'
          ? weightKg === null
            ? ''
            : weightForKeypad(weightKg, unitSystem, locale)
          : reps === null
            ? ''
            : String(reps),
      );
      reveal(setLogId);
    },
    [locale, reveal, unitSystem],
  );

  if (userId === null) {
    return <Screen />;
  }

  const live = workout.workout;

  if (live === null) {
    return (
      <Screen>
        <EmptyState
          title={t('workout.none_title')}
          body={t('workout.none_body')}
          action={<Button label={t('workout.start')} onPress={() => workout.start(t('workout.default_title'))} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">{live.title}</AppText>
        <Button variant="secondary" label={t('workout.finish')} onPress={workout.finish} />
      </View>

      <ScrollView
        ref={scroll}
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollOffset.current = event.nativeEvent.contentOffset.y;
        }}
        onLayout={(event) => {
          viewportHeight.current = event.nativeEvent.layout.height;
        }}
        contentContainerStyle={styles.list}
      >
        {live.exercises.length === 0 ? (
          <EmptyState title={t('workout.empty_title')} body={t('workout.empty_body')} />
        ) : (
          live.exercises.map((exercise) => (
            <View
              key={exercise.id}
              onLayout={(event) => blockTops.current.set(exercise.id, event.nativeEvent.layout.y)}
            >
              <ExerciseBlockFor
                userId={userId}
                workoutId={live.id}
                exercise={exercise}
                editing={editing}
                onEdit={startEditing}
                onToggleComplete={workout.setCompleted}
                onAddSet={() => workout.addSet(exercise.id)}
                onRowLayout={(setLogId, top, height) =>
                  rowBoxes.current.set(setLogId, { blockId: exercise.id, top, height })
                }
              />
            </View>
          ))
        )}

        <Button variant="secondary" label={t('workout.add_exercise')} onPress={() => setPicking(true)} />
      </ScrollView>

      {editing === null ? null : (
        <View style={styles.editor}>
          <SetEditor
            field={editing.field}
            draft={draft}
            rir={rirOf(live, editing.setLogId)}
            onDraftChange={setDraft}
            onValueChange={(value) => workout.writeField(editing.setLogId, COLUMN[editing.field], value)}
            onRirChange={(value) => workout.writeField(editing.setLogId, 'rir', value)}
            onDone={() => setEditing(null)}
            onHeightChange={(height) => {
              editorHeight.current = height;
              reveal(editing.setLogId);
            }}
          />
        </View>
      )}

      <ExercisePicker
        visible={picking}
        userId={userId}
        onClose={() => setPicking(false)}
        onPick={(exerciseId) => {
          setPicking(false);
          workout.addExercise(exerciseId);
        }}
      />
    </Screen>
  );
}

/** One block, with the catalog row and last time's performance it needs. Split out so each memo is per exercise. */
function ExerciseBlockFor({
  userId,
  workoutId,
  exercise,
  editing,
  onEdit,
  onToggleComplete,
  onAddSet,
  onRowLayout,
}: {
  readonly userId: string;
  readonly workoutId: string;
  readonly exercise: Parameters<typeof ExerciseBlock>[0]['exercise'];
  readonly editing: Editing | null;
  readonly onEdit: (setLogId: string, field: SetRowField, weightKg: number | null, reps: number | null) => void;
  readonly onToggleComplete: (setLogId: string, isCompleted: boolean) => void;
  readonly onAddSet: () => void;
  readonly onRowLayout: (setLogId: string, top: number, height: number) => void;
}) {
  const catalog = useMemo(
    () => listExercises(userId).find((one) => one.id === exercise.exerciseId),
    [exercise.exerciseId, userId],
  );
  const previous = useMemo(
    () => readPreviousPerformance({ userId, exerciseId: exercise.exerciseId, exceptWorkoutId: workoutId }),
    [exercise.exerciseId, userId, workoutId],
  );

  return (
    <ExerciseBlock
      exercise={exercise}
      catalog={catalog}
      previous={previous}
      editing={editing}
      onEdit={(setLogId, field) => {
        const set = exercise.sets.find((one) => one.id === setLogId);
        onEdit(setLogId, field, set?.weightKg ?? null, set?.reps ?? null);
      }}
      onToggleComplete={onToggleComplete}
      onAddSet={onAddSet}
      onRowLayout={onRowLayout}
    />
  );
}

function rirOf(live: { readonly exercises: readonly { readonly sets: readonly { readonly id: string; readonly rir: number | null }[] }[] }, setLogId: string): number | null {
  for (const exercise of live.exercises) {
    const set = exercise.sets.find((one) => one.id === setLogId);
    if (set !== undefined) return set.rir;
  }
  return null;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], padding: space[4] },
  list: { padding: space[4], gap: space[6], paddingBottom: space[12] },
  // Over the list, not beside it: `offsetToReveal`'s geometry assumes the keypad covers the bottom of the viewport.
  editor: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
