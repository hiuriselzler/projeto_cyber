import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { readExercise } from '@/db/catalog';
import { readExerciseSessions } from '@/db/history';
import {
  AppText,
  formatLocalDate,
  LineChart,
  Screen,
  sizes,
  space,
  spokenQuantity,
  useLocale,
  useT,
  useTheme,
  type LineChartPoint,
} from '@/ui';

import { exerciseLabel } from './exerciseName';
import { chartQuantity, exerciseCharts, hasValues, isCharted } from './history';
import { useDatabaseRead } from './useDatabaseRead';
import { LoggedSetLine } from './LoggedSetLine';
import { useSignedInUserId } from './useLiveWorkout';

/**
 * One exercise's history — FR-2.14, task 004 stage 7: its charts, then every session, newest first.
 *
 * Three charts for an exercise measured in load — top set, best e1RM, volume — each a value of the core's
 * `session_metrics()` per session (INV-04, INV-07), plotted on real dates in the user's unit (INV-01, INV-17, INV-25).
 * A session with nothing to plot is a gap, never a zero: a set logged without RIR leaves the e1RM chart blank there,
 * and the chart says why. A hold or a carry lists its time and distance and is not charted yet (stage 7, decision 6).
 *
 * Opens for an archived exercise as readily as a live one — archiving never orphans history (INV-11) — and is never
 * gated (INV-26).
 */
export function ExerciseHistoryScreen({ exerciseId }: { readonly exerciseId: string }) {
  const t = useT();
  const router = useRouter();
  const { locale, unitSystem } = useLocale();
  const userId = useSignedInUserId();

  const read = useCallback(
    () =>
      userId === null
        ? null
        : { exercise: readExercise(userId, exerciseId), sessions: readExerciseSessions(userId, exerciseId) },
    [exerciseId, userId],
  );
  const [history] = useDatabaseRead(read);
  const sessions = history?.sessions;
  const charts = useMemo(
    () => (sessions === undefined ? null : exerciseCharts(sessions, unitSystem, locale)),
    [locale, sessions, unitSystem],
  );

  if (userId === null || history === null || history.exercise === null || charts === null) {
    return <Screen />;
  }

  const { exercise } = history;
  const charted = isCharted(exercise.tracking);
  const format = (value: number) => {
    const quantity = chartQuantity(value, unitSystem, locale);
    return t('summary.quantity', { value: quantity.text, unit: t(`unit.${quantity.unit}`) });
  };
  const speak = (value: number) => spokenQuantity(t, chartQuantity(value, unitSystem, locale));
  const series: { key: string; title: string; points: readonly LineChartPoint[] }[] = [
    { key: 'top', title: t('history.chart_top'), points: charts.topLoad },
    { key: 'e1rm', title: t('history.chart_e1rm'), points: charts.e1rm },
    { key: 'volume', title: t('history.chart_volume'), points: charts.volume },
  ].filter((chart) => hasValues(chart.points));
  // The e1RM chart has a gap where a session had a load and no e1RM — almost always a set logged without RIR.
  const e1rmHasGaps = charts.metrics.some((each) => each.topLoadKg !== null && each.bestE1rmKg === null);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.heading}>
          <AppText variant="title" accessibilityRole="header">
            {exerciseLabel(exercise, t)}
          </AppText>
          {exercise.archivedAt === null ? null : (
            <AppText variant="caption" tone="textMuted">
              {t('history.archived_note')}
            </AppText>
          )}
        </View>

        {history.sessions.length === 0 ? (
          <AppText tone="textSecondary">{t('history.sessions_empty')}</AppText>
        ) : !charted ? (
          <AppText variant="caption" tone="textMuted">
            {t('history.charts_time_distance')}
          </AppText>
        ) : series.length === 0 ? (
          <AppText variant="caption" tone="textMuted">
            {t('history.charts_empty')}
          </AppText>
        ) : (
          series.map((chart) => (
            <View key={chart.key} style={styles.chart}>
              <LineChart title={chart.title} points={chart.points} formatValue={format} speakValue={speak} hue="strength" />
              {chart.key === 'e1rm' && e1rmHasGaps ? (
                <AppText variant="caption" tone="textMuted">
                  {t('history.e1rm_note')}
                </AppText>
              ) : null}
            </View>
          ))
        )}

        {history.sessions.length === 0 ? null : (
          <AppText variant="label" accessibilityRole="header">
            {t('history.sessions_title')}
          </AppText>
        )}
        {history.sessions
          .map((session, at) => ({ session, countedSets: charts.metrics[at]?.countedSets ?? 0 }))
          .reverse()
          .map(({ session, countedSets }) => (
          <SessionBlock
            key={session.workoutId}
            title={session.title}
            day={formatLocalDate(session.localDate, locale)}
            countedSets={countedSets}
            onOpen={() => router.push({ pathname: '/workouts/[id]', params: { id: session.workoutId } })}
          >
            {session.performed.map((set) => (
              <LoggedSetLine key={set.setIndex} set={set} tracking={exercise.tracking} />
            ))}
          </SessionBlock>
        ))}
      </ScrollView>
    </Screen>
  );
}

function SessionBlock({
  title,
  day,
  countedSets,
  onOpen,
  children,
}: {
  readonly title: string;
  readonly day: string;
  readonly countedSets: number;
  readonly onOpen: () => void;
  readonly children: React.ReactNode;
}) {
  const t = useT();
  const { colors } = useTheme();
  const sets = t('history.counted_sets', { count: countedSets });
  return (
    <View style={[styles.session, { borderTopColor: colors.borderSubtle }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('history.row', { title, day, sets })}
        onPress={onOpen}
        style={styles.sessionHead}
      >
        {/* The workout's title is the user's own words, exactly as stored (INV-27). */}
        <AppText>{title}</AppText>
        <View style={styles.facts}>
          <AppText variant="caption" tone="textSecondary">
            {day}
          </AppText>
          <AppText variant="caption" tone="textSecondary">
            {sets}
          </AppText>
        </View>
      </Pressable>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[4], gap: space[6], paddingBottom: space[12] },
  heading: { gap: space[1] },
  chart: { gap: space[2] },
  session: { gap: space[2], paddingTop: space[4], borderTopWidth: sizes.edgeHairline },
  sessionHead: { gap: space[1], minHeight: sizes.targetMin },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
});
