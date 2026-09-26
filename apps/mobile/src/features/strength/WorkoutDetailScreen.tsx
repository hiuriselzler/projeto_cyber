import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { readExercise } from '@/db/catalog';
import {
  readExerciseHistory,
  readFinishedWorkout,
  readWorkoutDetail,
  readWorkoutSets,
  type DetailExercise,
} from '@/db/history';
import { AppText, Button, formatLocalDate, formatWeight, MetricTile, Screen, sizes, space, useLocale, useT, useTheme } from '@/ui';

import { exerciseLabel } from './exerciseName';
import { recordsOf, totalsOf } from './finish';
import { LoggedSetLine } from './LoggedSetLine';
import { recordGroups } from './recordGroups';
import { useDatabaseRead } from './useDatabaseRead';
import { useSignedInUserId } from './useLiveWorkout';

/**
 * One finished workout, every set as it was logged — FR-2.14, task 004 stage 7.
 *
 * **The log, not the totals.** Warm-ups, drops, back-offs and unticked rows are all here, each marked, because the
 * history is a record of what was done; INV-04 keeps them out of the counted sets and the volume at the top, which are
 * the core's (`totalsOf`).
 *
 * **The records it still holds** are judged exactly as the finish summary judges them — against every other finished
 * workout, whatever its date, and strictly (stage 6, decision 2; stage 7, decision 5). So an old workout names the
 * records its summary would name *today*, and none that a later workout has since beaten or tied. Recomputed on every
 * read; the device stores no record (03 §8).
 */
export function WorkoutDetailScreen({ workoutId }: { readonly workoutId: string }) {
  const t = useT();
  const router = useRouter();
  const { locale, unitSystem } = useLocale();
  const userId = useSignedInUserId();

  const read = useCallback(() => {
    if (userId === null) return null;
    const workout = readFinishedWorkout(userId, workoutId);
    // An open workout has no history yet: its place is the live screen.
    if (workout === null || workout.endedAt === null) return null;
    const judged = readWorkoutSets(userId, workoutId);
    return {
      workout,
      // Each resolved even when archived: archiving never orphans history (INV-11).
      exercises: readWorkoutDetail(userId, workoutId).map((entry) => ({ entry, catalog: readExercise(userId, entry.exerciseId) })),
      totals: totalsOf(judged),
      records: recordsOf(judged, (exerciseId) => readExerciseHistory({ userId, exerciseId, exceptWorkoutId: workoutId })),
    };
  }, [userId, workoutId]);
  const [detail] = useDatabaseRead(read);

  if (userId === null || detail === null) {
    return <Screen />;
  }

  const { workout, exercises, totals, records } = detail;
  const groups = recordGroups(records, userId, t, unitSystem, locale);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.heading}>
          {/* The title is the user's own words, exactly as stored (INV-27). */}
          <AppText variant="title" accessibilityRole="header">
            {workout.title}
          </AppText>
          <AppText tone="textSecondary">{formatLocalDate(workout.localDate, locale)}</AppText>
        </View>

        <View style={styles.tiles}>
          <MetricTile label={t('summary.sets_label')} quantity={{ text: String(totals.countedSets) }} />
          <MetricTile label={t('summary.volume_label')} quantity={formatWeight(totals.volumeKg, unitSystem, locale)} />
        </View>
        {totals.untickedSets > 0 ? (
          <AppText variant="caption" tone="textSecondary">
            {t('summary.unticked', { count: totals.untickedSets })}
          </AppText>
        ) : null}
        {/* 1–10, the user's own annotation for their history — never RPE, never an input to anything (INV-03). */}
        {workout.perceivedFatigue === null ? null : (
          <AppText tone="textSecondary">{t('history.fatigue', { value: workout.perceivedFatigue })}</AppText>
        )}
        {workout.notes === null ? null : (
          <View style={styles.block}>
            <AppText variant="label" tone="textSecondary">
              {t('history.notes')}
            </AppText>
            <AppText>{workout.notes}</AppText>
          </View>
        )}

        <View style={styles.block}>
          <AppText variant="label" accessibilityRole="header">
            {records.length > 0 ? t('history.records_title', { count: records.length }) : t('history.records_none')}
          </AppText>
          {groups.map((group) => (
            <View key={group.key} style={styles.recordGroup}>
              <AppText variant="caption" tone="textSecondary">
                {group.subject}
              </AppText>
              {group.records.map((record) => (
                <AppText key={record.key} accessible>
                  {t('history.record_line', { kind: record.kind, value: record.value })}
                </AppText>
              ))}
            </View>
          ))}
          <AppText variant="caption" tone="textMuted">
            {t('history.records_note')}
          </AppText>
        </View>

        {exercises.map(({ entry, catalog }) => (
          <ExerciseLog
            key={entry.workoutExerciseId}
            exercise={entry}
            name={catalog === null ? '' : exerciseLabel(catalog, t)}
            onOpenHistory={() => router.push({ pathname: '/exercise/[id]', params: { id: entry.exerciseId } })}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

function ExerciseLog({
  exercise,
  name,
  onOpenHistory,
}: {
  readonly exercise: DetailExercise;
  /** Translated for a global, exactly as typed for the user's own (INV-27). */
  readonly name: string;
  readonly onOpenHistory: () => void;
}) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View style={[styles.exercise, { borderTopColor: colors.borderSubtle }]}>
      <AppText variant="label" accessibilityRole="header">
        {name}
      </AppText>
      {exercise.notes === null ? null : <AppText tone="textSecondary">{exercise.notes}</AppText>}
      {exercise.sets.length === 0 ? (
        <AppText variant="caption" tone="textMuted">
          {t('history.no_sets')}
        </AppText>
      ) : (
        exercise.sets.map((set) => <LoggedSetLine key={set.setIndex} set={set} tracking={exercise.tracking} />)
      )}
      <Button variant="quiet" label={t('history.exercise_link')} onPress={onOpenHistory} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[4], gap: space[6], paddingBottom: space[12] },
  heading: { gap: space[1] },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space[6] },
  block: { gap: space[2] },
  recordGroup: { gap: space[1] },
  exercise: { gap: space[2], paddingTop: space[4], borderTopWidth: sizes.edgeHairline },
});
