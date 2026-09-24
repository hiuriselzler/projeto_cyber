import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { readExercise } from '@/db/catalog';
import {
  missingForCompletion,
  readPreviousPerformance,
  type LiveSet,
  type LiveWorkout,
  type SetField,
  type Tracking,
} from '@/db/strength';
import {
  AppText,
  Button,
  EmptyState,
  offsetToReveal,
  Screen,
  secondsToTimeDigits,
  shortDistanceForKeypad,
  space,
  useLocale,
  useT,
  weightForKeypad,
  type SetRowField,
} from '@/ui';

import { ExerciseBlock } from './ExerciseBlock';
import { exerciseLabel } from './exerciseName';
import { ExerciseOptionsSheet } from './ExerciseOptionsSheet';
import { ExercisePicker } from './ExercisePicker';
import { nextFocus } from './liveFlow';
import { RestTimerBar } from './RestTimerBar';
import { SetEditor } from './SetEditor';
import { SetTypeSheet } from './SetTypeSheet';
import { useLiveWorkout, useSignedInUserId } from './useLiveWorkout';

/** Which column of `set_logs` each editable field of the row writes. */
const COLUMN: Record<SetRowField, SetField> = {
  weight: 'weightKg',
  reps: 'reps',
  rir: 'rir',
  time: 'durationS',
  distance: 'distanceM',
};

/** The row field that edits each column — how a missing column becomes the keypad the ✓ opens (task 004 stage 5c). */
const FIELD_OF: Record<SetField, SetRowField> = {
  weightKg: 'weight',
  reps: 'reps',
  rir: 'rir',
  durationS: 'time',
  distanceM: 'distance',
};

/**
 * Where the keypad lands when focus moves on with it open: the first thing each mode's row asks for. A switch, not a
 * lookup object, for the reason `SetRow`'s `sentenceKey` gives: the INV-23 fence reads `duration: <literal>` as a timing.
 */
function firstField(tracking: Tracking): SetRowField {
  switch (tracking) {
    case 'weight_reps':
    case 'distance_duration':
      return 'weight';
    case 'reps_only':
      return 'reps';
    case 'duration':
      return 'time';
  }
}

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
  /** The set whose type sheet is open, and the exercise whose options sheet is open (task 004 stage 5b). */
  const [typeFor, setTypeFor] = useState<string | null>(null);
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  /**
   * The keypad's height, in state as well as in a ref — **the ref aims the scroll, the state makes the scroll
   * possible**, and stage 3 had only the ref.
   *
   * `offsetToReveal` can ask for any offset it likes; a `ScrollView` still clamps to `content − viewport`. With one
   * exercise on screen the content is barely taller than the viewport, so the clamp is about zero and the row stayed
   * exactly where it was, underneath the keypad. On the Galaxy S21 FE that was invisible — the phone is 2340 px tall
   * and the list had room to spare — and on a 1600 px screen the keypad covered the row it was editing outright,
   * which is the one thing [07 §6](../../../../docs/07-brand-and-ui.md) says the keypad must never do.
   *
   * Reserving the keypad's height as bottom padding while editing gives the list something to scroll into, so the
   * offset the geometry asks for is an offset the list can actually reach.
   */
  const [editorHeight, setEditorHeight] = useState(0);

  const scroll = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const viewportHeight = useRef(0);
  const editorHeightRef = useRef(0);
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
        keypadHeight: editorHeightRef.current,
        margin: space[2],
      }),
      animated: true,
    });
  }, []);

  const startEditing = useCallback(
    (setLogId: string, field: SetRowField, set: LiveSet | undefined) => {
      setEditing({ setLogId, field });
      setDraft(set === undefined ? '' : draftFor(field, set, unitSystem, locale));
      reveal(setLogId);
    },
    [locale, reveal, unitSystem],
  );

  /**
   * The ✓, and where focus goes next — 07 §6. Focus is computed from the workout **as SQLite now holds it**, the one
   * `setCompleted` hands back, so a superset alternates by what is actually done rather than by what the screen
   * remembers (FR-2.6). With the keypad open it moves to the next set's weight; otherwise the next set is scrolled
   * into view, ready for one tap on its pre-filled row.
   */
  const toggleComplete = useCallback(
    (setLogId: string, isCompleted: boolean) => {
      // **A row missing what its mode needs is not completed** — the keypad opens on that field instead: one tap to the
      // fix, and no error to read mid-set (03 §4, task 004 stage 5c). Checked against the rows as read, before any write.
      const current = workout.workout === null ? undefined : findWithExercise(workout.workout, setLogId);
      if (isCompleted && current !== undefined) {
        const missing = missingForCompletion(current.tracking, current.set);
        if (missing !== null) {
          startEditing(setLogId, FIELD_OF[missing], current.set);
          return;
        }
      }
      const fresh = workout.setCompleted(setLogId, isCompleted);
      if (!isCompleted || fresh === null) return;
      const next = nextFocus(fresh, setLogId);
      if (next === null) {
        setEditing(null);
        return;
      }
      if (editing === null) {
        reveal(next.setLogId);
        return;
      }
      const target = findWithExercise(fresh, next.setLogId);
      if (target !== undefined) startEditing(next.setLogId, firstField(target.tracking), target.set);
    },
    [editing, reveal, startEditing, workout],
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

      <RestTimerBar
        workout={live}
        skippedRest={workout.skippedRest}
        onLess={() => workout.adjustRest(-15)}
        onMore={() => workout.adjustRest(15)}
        onSkip={workout.skipRest}
      />

      <ScrollView
        ref={scroll}
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollOffset.current = event.nativeEvent.contentOffset.y;
        }}
        onLayout={(event) => {
          viewportHeight.current = event.nativeEvent.layout.height;
        }}
        contentContainerStyle={[styles.list, editing === null ? null : { paddingBottom: editorHeight + space[6] }]}
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
                onToggleComplete={toggleComplete}
                onAddSet={() => workout.addSet(exercise.id)}
                onChangeType={setTypeFor}
                onOptions={() => setOptionsFor(exercise.id)}
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
              editorHeightRef.current = height;
              // Guarded so a layout pass that reports the same height cannot bounce the padding and re-enter layout.
              setEditorHeight((current) => (current === height ? current : height));
              reveal(editing.setLogId);
            }}
          />
        </View>
      )}

      <LiveSheets
        userId={userId}
        live={live}
        typeFor={typeFor}
        optionsFor={optionsFor}
        onCloseType={() => setTypeFor(null)}
        onCloseOptions={() => setOptionsFor(null)}
        controller={workout}
        onSetRemoved={(setLogId) => {
          if (editing?.setLogId === setLogId) setEditing(null);
        }}
      />

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
  onChangeType,
  onOptions,
}: {
  readonly userId: string;
  readonly workoutId: string;
  readonly exercise: Parameters<typeof ExerciseBlock>[0]['exercise'];
  readonly editing: Editing | null;
  readonly onEdit: (setLogId: string, field: SetRowField, set: LiveSet | undefined) => void;
  readonly onToggleComplete: (setLogId: string, isCompleted: boolean) => void;
  readonly onAddSet: () => void;
  readonly onRowLayout: (setLogId: string, top: number, height: number) => void;
  readonly onChangeType: (setLogId: string) => void;
  readonly onOptions: () => void;
}) {
  // `readExercise`, not the live catalog list: an exercise hidden after it was added — or one a routine carried in —
  // must still be named in the workout it is part of (INV-11). The list excludes hidden rows and left this blank.
  const catalog = useMemo(() => readExercise(userId, exercise.exerciseId), [exercise.exerciseId, userId]);
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
        onEdit(
          setLogId,
          field,
          exercise.sets.find((one) => one.id === setLogId),
        );
      }}
      onToggleComplete={onToggleComplete}
      onAddSet={onAddSet}
      onRowLayout={onRowLayout}
      onChangeType={onChangeType}
      onOptions={onOptions}
    />
  );
}

/**
 * The two sheets a live workout opens: a set's type (with its removal), and an exercise's options. Mounted only while
 * open, each from the caller's own state, so neither holds a copy of anything the database already says.
 */
function LiveSheets({
  userId,
  live,
  typeFor,
  optionsFor,
  onCloseType,
  onCloseOptions,
  controller,
  onSetRemoved,
}: {
  readonly userId: string;
  readonly live: LiveWorkout;
  readonly typeFor: string | null;
  readonly optionsFor: string | null;
  readonly onCloseType: () => void;
  readonly onCloseOptions: () => void;
  readonly controller: ReturnType<typeof useLiveWorkout>;
  readonly onSetRemoved: (setLogId: string) => void;
}) {
  const t = useT();
  const typed = typeFor === null ? undefined : findSet(live, typeFor);
  const index = optionsFor === null ? -1 : live.exercises.findIndex((one) => one.id === optionsFor);
  const exercise = live.exercises[index];
  const catalog = useMemo(
    () => (exercise === undefined ? null : readExercise(userId, exercise.exerciseId)),
    [exercise, userId],
  );

  return (
    <>
      {typed === undefined ? null : (
        <SetTypeSheet
          visible
          setNumber={typed.setIndex}
          setType={typed.setType}
          onChoose={(setType) => {
            controller.setType(typed.id, setType);
            onCloseType();
          }}
          onRemove={() => {
            controller.removeSet(typed.id);
            onSetRemoved(typed.id);
            onCloseType();
          }}
          onClose={onCloseType}
        />
      )}
      {exercise === undefined ? null : (
        <ExerciseOptionsSheet
          visible
          title={catalog === null ? '' : exerciseLabel(catalog, t)}
          restSeconds={exercise.restSeconds}
          isFirst={index === 0}
          isLast={index === live.exercises.length - 1}
          linkedBelow={
            exercise.supersetGroup !== null && live.exercises[index + 1]?.supersetGroup === exercise.supersetGroup
          }
          onRest={(seconds) => controller.setRest(exercise.id, seconds)}
          onMove={(delta) => controller.moveExercise(index, delta)}
          onToggleSuperset={() => controller.toggleSuperset(index)}
          onRemove={() => {
            controller.removeExercise(exercise.id);
            onCloseOptions();
          }}
          onClose={onCloseOptions}
        />
      )}
    </>
  );
}

/** A set and its exercise's tracking mode — what the ✓ checks and where focus lands. */
function findWithExercise(live: LiveWorkout, setLogId: string): { set: LiveSet; tracking: Tracking } | undefined {
  for (const exercise of live.exercises) {
    const set = exercise.sets.find((one) => one.id === setLogId);
    if (set !== undefined) return { set, tracking: exercise.tracking };
  }
  return undefined;
}

/** What the keypad starts from for a field: the stored value, in the user's unit and separator (INV-01). */
function draftFor(
  field: SetRowField,
  set: LiveSet,
  unitSystem: Parameters<typeof weightForKeypad>[1],
  locale: Parameters<typeof weightForKeypad>[2],
): string {
  switch (field) {
    case 'weight':
      return set.weightKg === null ? '' : weightForKeypad(set.weightKg, unitSystem, locale);
    case 'distance':
      return set.distanceM === null ? '' : shortDistanceForKeypad(set.distanceM, unitSystem, locale);
    case 'time':
      return set.durationS === null ? '' : secondsToTimeDigits(set.durationS);
    case 'reps':
      return set.reps === null ? '' : String(set.reps);
    case 'rir':
      return '';
  }
}

function findSet(live: LiveWorkout, setLogId: string) {
  for (const exercise of live.exercises) {
    const set = exercise.sets.find((one) => one.id === setLogId);
    if (set !== undefined) return set;
  }
  return undefined;
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
