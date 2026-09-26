import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { listFinishedWorkouts, readSetsOfWorkouts } from '@/db/history';
import { AppText, Button, EmptyState, formatLocalDate, formatWeight, Screen, sizes, space, useLocale, useT, useTheme } from '@/ui';

import { listRows, type WorkoutListRow } from './history';
import { useDatabaseRead } from './useDatabaseRead';
import { useSignedInUserId } from './useLiveWorkout';

/** Workouts a page adds. A year of training three times a week is about seven pages. */
const PAGE = 25;

/**
 * The user's finished workouts, newest first — FR-2.14, task 004 stage 7.
 *
 * Each row says what the workout came to — counted sets and volume, through the core (INV-04) — and opens its detail.
 * The list is a growing prefix read whole from SQLite, on every return to the screen too, so a workout finished
 * meanwhile appears at the top (`useDatabaseRead`, the compiler-proof re-read). Never gated (INV-26).
 */
export function WorkoutHistoryScreen() {
  const t = useT();
  const router = useRouter();
  const userId = useSignedInUserId();
  const [pages, setPages] = useState(1);

  const read = useCallback(() => {
    if (userId === null) return { rows: [] as WorkoutListRow[], more: false };
    // One past the page, to know whether there is more without a count query.
    const items = listFinishedWorkouts(userId, pages * PAGE + 1);
    const shown = items.slice(0, pages * PAGE);
    return { rows: listRows(shown, readSetsOfWorkouts(userId, shown.map((item) => item.id))), more: items.length > shown.length };
  }, [pages, userId]);
  const [{ rows, more }] = useDatabaseRead(read);

  if (userId === null) {
    return <Screen />;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.list}>
        <AppText variant="title" accessibilityRole="header">
          {t('history.title')}
        </AppText>
        {rows.length === 0 ? (
          <EmptyState title={t('history.empty_title')} body={t('history.empty_body')} />
        ) : (
          rows.map((row) => (
            <WorkoutRow
              key={row.id}
              row={row}
              onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: row.id } })}
            />
          ))
        )}
        {more ? <Button variant="secondary" label={t('history.more')} onPress={() => setPages((count) => count + 1)} /> : null}
      </ScrollView>
    </Screen>
  );
}

function WorkoutRow({ row, onPress }: { readonly row: WorkoutListRow; readonly onPress: () => void }) {
  const t = useT();
  const { locale, unitSystem } = useLocale();
  const { colors } = useTheme();
  const day = formatLocalDate(row.localDate, locale);
  const sets = t('history.counted_sets', { count: row.countedSets });
  const volume = row.volumeKg === null ? null : formatWeight(row.volumeKg, unitSystem, locale);
  const volumeText = volume === null ? null : t('summary.quantity', { value: volume.text, unit: t(`unit.${volume.unit}`) });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        volumeText === null
          ? t('history.row', { title: row.title, day, sets })
          : t('history.row_volume', { title: row.title, day, sets, volume: volumeText })
      }
      onPress={onPress}
      style={[styles.row, { borderBottomColor: colors.borderSubtle }]}
    >
      {/* The title is the user's own words, or the default one — shown exactly as stored (INV-27). */}
      <AppText>{row.title}</AppText>
      <View style={styles.facts}>
        <AppText variant="caption" tone="textSecondary">
          {day}
        </AppText>
        <AppText variant="caption" tone="textSecondary">
          {sets}
        </AppText>
        {volumeText === null ? null : (
          <AppText variant="caption" tone="textSecondary">
            {volumeText}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: space[4], gap: space[3], paddingBottom: space[12] },
  row: { gap: space[1], minHeight: sizes.targetMin, paddingBottom: space[3], borderBottomWidth: sizes.edgeHairline },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
});
