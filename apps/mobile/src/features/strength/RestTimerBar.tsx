import { StyleSheet, View } from 'react-native';

import type { LiveWorkout } from '@/db/strength';
import { AppText, Button, formatDuration, radii, sizes, space, useT, useTheme } from '@/ui';

import { useRestClock } from './useRestClock';

interface RestTimerBarProps {
  readonly workout: LiveWorkout;
  readonly skippedRest: string | null;
  readonly onLess: () => void;
  readonly onMore: () => void;
  readonly onSkip: () => void;
}

/**
 * The rest timer — 07 §6. A bar pinned above the list, in thumb reach, never over the row being edited. Shown while
 * the keypad is closed; with it open the rest moves into the keypad's heading line (`RestCountdown`), because on a
 * short screen the bar and the keypad together leave the list no room at all (task 004's closing pass).
 */
export function RestTimerBar({ workout, skippedRest, onLess, onMore, onSkip }: RestTimerBarProps) {
  const t = useT();
  const { colors } = useTheme();
  const clock = useRestClock(workout, skippedRest);
  if (clock === null) return null;

  const left = formatDuration(clock.secondsLeft);
  return (
    // No live region: the label changes every second, and a screen reader announcing each one would drown the workout.
    // The readout is one focusable element that says the time left when the user asks.
    <View style={[styles.bar, { backgroundColor: colors.bgElevated, borderColor: colors.accent }]}>
      <View accessible accessibilityLabel={t('a11y.rest_timer', { time: left })} style={styles.readout}>
        <AppText variant="caption" tone="textSecondary">
          {t('rest.title')}
        </AppText>
        <AppText variant="metricLg">{left}</AppText>
      </View>
      <View style={styles.controls}>
        <Button variant="secondary" label={t('rest.less')} onPress={onLess} />
        <Button variant="secondary" label={t('rest.more')} onPress={onMore} />
        <Button variant="quiet" label={t('rest.skip')} onPress={onSkip} />
      </View>
    </View>
  );
}

/**
 * The rest while the keypad is open — the countdown alone, on the keypad's heading line and at that line's height, so
 * the keypad grows by nothing and the list keeps every point it had (07 §6). No controls: a 56 dp target would grow the
 * line by the room this exists to save, and −15 s, +15 s and skip are one tap away, on the bar that returns with *OK*.
 */
export function RestCountdown({ workout, skippedRest }: { readonly workout: LiveWorkout; readonly skippedRest: string | null }) {
  const t = useT();
  const clock = useRestClock(workout, skippedRest);
  if (clock === null) return null;

  const left = formatDuration(clock.secondsLeft);
  return (
    <View accessible accessibilityLabel={t('a11y.rest_timer', { time: left })} style={styles.countdown}>
      <AppText variant="label" tone="textSecondary">
        {t('rest.title')}
      </AppText>
      <AppText variant="label" tabular>
        {left}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
    marginHorizontal: space[4],
    marginBottom: space[2],
    padding: space[2],
    borderWidth: sizes.edgeSelected,
    borderRadius: radii.md,
  },
  readout: { gap: space[1] },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  countdown: { flexDirection: 'row', gap: space[2] },
});
