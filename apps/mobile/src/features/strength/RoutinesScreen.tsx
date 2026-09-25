import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  duplicateRoutine,
  listArchivedRoutines,
  listRoutines,
  setRoutineArchived,
  startWorkoutFromRoutine,
  type RoutineSummary,
} from '@/db/routines';
import { readOpenWorkout } from '@/db/strength';
import { AppText, Button, Chip, EmptyState, readDeviceTimeZone, Screen, sizes, space, useT, useTheme } from '@/ui';

import { RoutineForm, type RoutineFormTarget } from './RoutineForm';
import { groupByFolder } from './routineList';
import { useDatabaseRead } from './useDatabaseRead';
import { useSignedInUserId } from './useLiveWorkout';

/**
 * The user's routines — FR-2.5–2.7, task 004 stage 5a.
 *
 * Grouped by folder, each one startable in a tap, editable, duplicable and archivable — and archived ones offered
 * back from a toggle, because stage 4 shipped a hide with no way back and had to add one (task 004 § Stages).
 *
 * Like every screen in this feature it holds view state and nothing else: every list is read from SQLite, and every
 * write is followed by a re-read (INV-09's discipline, applied beyond the live workout).
 */
export function RoutinesScreen() {
  const t = useT();
  const router = useRouter();
  const userId = useSignedInUserId();

  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<RoutineFormTarget | null>(null);
  // Re-read after every write, and on every return to this screen — a workout finished on the workout screen, or a
  // routine edited in its editor, changed the database while this one stayed mounted underneath. Held in state rather
  // than a memo keyed on a counter, which the React Compiler reduced to "read once" (`useDatabaseRead`, stage 6 pass).
  const readLists = useCallback(
    () =>
      userId === null
        ? { active: [], archived: [], openWorkout: null }
        : { active: listRoutines(userId), archived: listArchivedRoutines(userId), openWorkout: readOpenWorkout(userId) },
    [userId],
  );
  const [{ active, archived, openWorkout }, refresh] = useDatabaseRead(readLists);
  const groups = useMemo(() => groupByFolder(active), [active]);

  const start = useCallback(
    (routineId: string) => {
      if (userId === null) return;
      const tz = readDeviceTimeZone() ?? 'UTC';
      void startWorkoutFromRoutine({ userId, routineId, now: Date.now(), tz }).then((workoutId) => {
        // Null means a workout was already open and nothing was started; the banner says so after the re-read.
        refresh();
        if (workoutId !== null) router.push('/workout');
      });
    },
    [refresh, router, userId],
  );

  if (userId === null) {
    return <Screen />;
  }

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">{t('routine.title')}</AppText>
        <Button label={t('routine.create')} onPress={() => setForm({ kind: 'new' })} />
      </View>

      {openWorkout === null ? null : (
        <View style={styles.banner}>
          <AppText variant="caption" tone="textSecondary">
            {t('routine.open_workout')}
          </AppText>
          <Button variant="secondary" label={t('routine.resume')} onPress={() => router.push('/workout')} />
        </View>
      )}

      <View style={styles.modeRow}>
        <Chip
          label={t('routine.archived_title')}
          role="checkbox"
          selected={showArchived}
          onPress={() => setShowArchived((current) => !current)}
        />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {showArchived ? (
          archived.length === 0 ? (
            <EmptyState title={t('routine.archived_title')} body={t('routine.archived_empty')} />
          ) : (
            <>
              <AppText variant="caption" tone="textMuted">
                {t('routine.archived_note')}
              </AppText>
              {archived.map((routine) => (
                <RoutineRow key={routine.id} routine={routine}>
                  <Button
                    variant="secondary"
                    label={t('routine.restore')}
                    onPress={() => {
                      setRoutineArchived({ userId, routineId: routine.id, archived: false, now: Date.now() });
                      refresh();
                    }}
                  />
                </RoutineRow>
              ))}
            </>
          )
        ) : groups.length === 0 ? (
          <EmptyState title={t('routine.empty_title')} body={t('routine.empty_body')} />
        ) : (
          groups.map((group) => (
            <View key={group.folder ?? ''} style={styles.group}>
              {/* A folder's name is the user's own words, shown exactly as typed (INV-27). */}
              {group.folder === null ? null : <AppText variant="label" tone="textSecondary">{group.folder}</AppText>}
              {group.routines.map((routine) => (
                <RoutineRow key={routine.id} routine={routine}>
                  <Button
                    label={t('routine.start')}
                    disabled={openWorkout !== null}
                    onPress={() => start(routine.id)}
                  />
                  <Button
                    variant="secondary"
                    label={t('routine.edit')}
                    onPress={() => router.push({ pathname: '/routine/[id]', params: { id: routine.id } })}
                  />
                  <Button
                    variant="quiet"
                    label={t('routine.duplicate')}
                    onPress={() => void duplicateRoutine({ userId, routineId: routine.id, now: Date.now() }).then(refresh)}
                  />
                  <Button
                    variant="quiet"
                    label={t('routine.archive')}
                    onPress={() => {
                      setRoutineArchived({ userId, routineId: routine.id, archived: true, now: Date.now() });
                      refresh();
                    }}
                  />
                </RoutineRow>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {form === null ? null : (
        <RoutineForm
          userId={userId}
          target={form}
          onClose={() => setForm(null)}
          onSaved={(routineId) => {
            setForm(null);
            refresh();
            // A routine just made is empty; the next thing anyone does with it is add exercises.
            if (form.kind === 'new') router.push({ pathname: '/routine/[id]', params: { id: routineId } });
          }}
        />
      )}
    </Screen>
  );
}

function RoutineRow({ routine, children }: { readonly routine: RoutineSummary; readonly children: React.ReactNode }) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.borderSubtle }]}>
      {/* The routine's name is user content: exactly as typed, never translated (INV-27). */}
      <AppText>{routine.name}</AppText>
      <AppText variant="caption" tone="textMuted">
        {t('routine.count', { count: routine.exerciseCount })}
      </AppText>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], padding: space[4] },
  banner: { paddingHorizontal: space[4], paddingBottom: space[2], gap: space[2] },
  modeRow: { paddingHorizontal: space[4] },
  list: { padding: space[4], gap: space[4], paddingBottom: space[12] },
  group: { gap: space[2] },
  row: { gap: space[1], paddingBottom: space[3], borderBottomWidth: sizes.edgeHairline },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], paddingTop: space[1] },
});
