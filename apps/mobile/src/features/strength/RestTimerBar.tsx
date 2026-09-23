import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { LiveWorkout } from '@/db/strength';
import { restOverTap } from '@/platform';
import { AppText, Button, formatDuration, radii, sizes, space, useT, useTheme } from '@/ui';

import { runningRest, secondsLeft } from './liveFlow';

/** How often the countdown redraws. A quarter second keeps the displayed second honest without a busy loop. */
const TICK_MS = 250;

interface RestTimerBarProps {
  readonly workout: LiveWorkout;
  readonly skippedRest: string | null;
  readonly onLess: () => void;
  readonly onMore: () => void;
  readonly onSkip: () => void;
}

/**
 * The rest timer — 07 §6. A bar pinned above the list, in thumb reach, never over the row being edited.
 *
 * **It holds a clock and nothing else.** Whether a rest is running, and until when, is `runningRest` over the workout
 * as SQLite holds it (task 004 § Stages, decision 2), so a force-quit mid-rest comes back to the same bar counting the
 * same seconds. Its own component on purpose: the countdown re-renders four times a second, and the set rows beside it
 * must not re-render with it — the ✓'s 100 ms (NFR-2) is spent on the write, not on a ticking parent.
 *
 * The end is felt — a haptic, once — because the lifter is looking at a bar, not at the phone. With the app in the
 * background the scheduled notification says it instead (`useLiveWorkout`).
 */
export function RestTimerBar({ workout, skippedRest, onLess, onMore, onSkip }: RestTimerBarProps) {
  const t = useT();
  const { colors } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const rest = runningRest(workout, now, skippedRest);
  const endsAt = rest?.endsAt ?? null;

  useEffect(() => {
    if (endsAt === null) return undefined;
    // The end is felt only when it is *seen* crossing — the previous tick before it, this one after. A rest that had
    // already ended when the clock resumed (an un-tick bringing an old one back) ends silently rather than buzzing late.
    let last = Date.now();
    const id = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (last < endsAt && tick >= endsAt) restOverTap();
      last = tick;
    }, TICK_MS);
    return () => clearInterval(id);
  }, [endsAt]);

  if (rest === null) return null;

  // The clock only runs while a rest does, so `now` can be stale the moment a new one starts. The set's completion is
  // a moment that has certainly passed, so it is a floor the display can trust: a fresh rest reads full, never long.
  const startedAt = rest.endsAt - rest.seconds * 1000;
  const left = formatDuration(secondsLeft(rest.endsAt, Math.max(now, startedAt)));
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
});
