import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { readExerciseHistory, readFinishedWorkout, readWorkoutSets } from '@/db/history';
import { recordTap } from '@/platform';
import { AppText, Button, formatCalendarDay, formatWeight, MetricTile, RecordState, Screen, space, useLocale, useT } from '@/ui';

import { recordsOf, totalsOf } from './finish';
import { recordGroups } from './recordGroups';
import { useSignedInUserId } from './useLiveWorkout';

/**
 * What a finished workout came to — task 004 stage 6, and the finish flow's celebration (FR-2.15).
 *
 * **Recomputed from the rows every time it opens** (decision 3): the totals and the records are the core's, over what
 * SQLite holds, and nothing about them is stored on the device (03 §8). So a force-quit here loses nothing, and
 * opening it again says the same thing, because a tie is not a record (INV-10). Records are judged against every
 * other finished workout, whatever its date — the current best, never "best as of then" (decision 2).
 *
 * The celebration is quiet (08 §6, 07 §7): one emphasis for the whole list, one haptic, and each record stated as a
 * fact. With none, it says so plainly — a session without a record is not a failure and is not framed as one.
 */
export function WorkoutSummaryScreen({ workoutId }: { readonly workoutId: string }) {
  const t = useT();
  const { locale, unitSystem } = useLocale();
  const router = useRouter();
  const userId = useSignedInUserId();

  const summary = useMemo(() => {
    if (userId === null) return null;
    const workout = readFinishedWorkout(userId, workoutId);
    if (workout === null) return null;
    const exercises = readWorkoutSets(userId, workoutId);
    return {
      workout,
      totals: totalsOf(exercises),
      records: recordsOf(exercises, (exerciseId) => readExerciseHistory({ userId, exerciseId, exceptWorkoutId: workoutId })),
    };
  }, [userId, workoutId]);

  const hasRecords = (summary?.records.length ?? 0) > 0;
  useEffect(() => {
    // Once, as the records appear — the one haptic a celebration is allowed (08 §6).
    if (hasRecords) recordTap();
  }, [hasRecords]);

  if (userId === null || summary === null) {
    return <Screen />;
  }

  const { workout, totals, records } = summary;
  const groups = recordGroups(records, userId, t, unitSystem, locale);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.heading}>
          <AppText variant="title" accessibilityRole="header">
            {t('summary.title')}
          </AppText>
          <AppText tone="textSecondary">
            {t('summary.subtitle', { title: workout.title, day: formatCalendarDay(workout.startedAt, locale) })}
          </AppText>
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

        {records.length > 0 ? (
          <RecordState title={t('summary.records_title', { count: records.length })} groups={groups} />
        ) : (
          <AppText tone="textSecondary">{t('summary.no_records')}</AppText>
        )}

        <Button label={t('summary.done')} onPress={() => router.replace('/')} />
        <Button
          variant="secondary"
          label={t('summary.open_detail')}
          onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: workoutId } })}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[4], gap: space[6] },
  heading: { gap: space[1] },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space[6] },
});
