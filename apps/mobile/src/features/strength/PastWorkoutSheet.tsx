import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { pastWorkoutProblem } from '@/db/strength';
import {
  AppText,
  Button,
  Chip,
  clockDigitsToMinutes,
  formatCalendarDay,
  formatClock,
  NumericKeypad,
  Sheet,
  space,
  useLocale,
  useT,
} from '@/ui';

import { atMinutes, dayStart } from './pastWorkout';

type Edge = 'start' | 'end';

interface PastWorkoutSheetProps {
  readonly visible: boolean;
  readonly onLog: (startsAt: number, endsAt: number) => void;
  readonly onClose: () => void;
}

/**
 * Logging a workout after the fact — FR-2.13, task 004 stage 6, decision 4.
 *
 * A day, stepped back from today, and a start and an end typed on the app's own keypad, filling from the right like a
 * set's time (`1930` is 19:30). **The times start blank and are required**: an hour the user did not type is an hour
 * the app made up. Nothing is written until *Log it* — there is no workout yet to write to — and then the ordinary live
 * screen opens, so every part of the set row works as it always does.
 *
 * A workout that runs past midnight is not offered: the end must be after the start on the chosen day. Rare enough
 * to leave out, and refused in words rather than guessed at.
 */
export function PastWorkoutSheet({ visible, onLog, onClose }: PastWorkoutSheetProps) {
  const t = useT();
  const { locale } = useLocale();
  const [daysBack, setDaysBack] = useState(0);
  const [digits, setDigits] = useState<Record<Edge, string>>({ start: '', end: '' });
  const [editing, setEditing] = useState<Edge>('start');
  // The clock as the sheet opened — read once, never during render — for the day and the check shown while typing.
  // *Log it* checks again against the clock at the tap, so a sheet left open past the chosen end still refuses it.
  const [now] = useState(() => Date.now());

  const day = dayStart(now, daysBack);
  const startMinutes = clockDigitsToMinutes(digits.start);
  const endMinutes = clockDigitsToMinutes(digits.end);
  const startsAt = startMinutes === null ? null : atMinutes(day, startMinutes);
  const endsAt = endMinutes === null ? null : atMinutes(day, endMinutes);

  const typedButInvalid = (digits.start !== '' && startMinutes === null) || (digits.end !== '' && endMinutes === null);
  const problem = startsAt === null || endsAt === null ? null : pastWorkoutProblem({ startsAt, endsAt, now });
  const error = typedButInvalid ? t('past.time_invalid') : problem === null ? null : t(`past.${problem}`);

  const minutesOf = (edge: Edge) => (edge === 'start' ? startMinutes : endMinutes);
  const shown = (edge: Edge) => {
    const minutes = minutesOf(edge);
    return minutes === null ? t('past.time_placeholder') : formatClock(minutes);
  };
  // A blank time is said in words: a screen reader reading the placeholder's dashes aloud would say nothing useful.
  const spoken = (edge: Edge) => {
    const minutes = minutesOf(edge);
    return minutes === null ? t('past.time_blank') : formatClock(minutes);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('past.title')}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <AppText variant="caption" tone="textSecondary">
          {t('past.note')}
        </AppText>

        <View style={styles.field}>
          <AppText variant="label" tone="textSecondary">
            {t('past.day')}
          </AppText>
          <View style={styles.row}>
            <Button variant="secondary" label={t('past.earlier')} onPress={() => setDaysBack(daysBack + 1)} />
            <AppText variant="metric">{formatCalendarDay(day, locale)}</AppText>
            <Button
              variant="secondary"
              label={t('past.later')}
              disabled={daysBack === 0}
              onPress={() => setDaysBack(Math.max(0, daysBack - 1))}
            />
          </View>
        </View>

        <View style={styles.row}>
          {(['start', 'end'] as const).map((edge) => (
            <View key={edge} style={styles.field}>
              <AppText variant="label" tone="textSecondary">
                {t(`past.${edge}`)}
              </AppText>
              <Chip
                size="workout"
                role="radio"
                label={shown(edge)}
                accessibilityLabel={t('past.time_label', { edge: t(`past.${edge}`), time: spoken(edge) })}
                selected={editing === edge}
                onPress={() => setEditing(edge)}
              />
            </View>
          ))}
        </View>

        {error === null ? null : (
          <AppText variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </AppText>
        )}

        <NumericKeypad
          value={digits[editing]}
          onChange={(next) => setDigits({ ...digits, [editing]: next })}
          onDone={() => setEditing(editing === 'start' ? 'end' : 'start')}
          allowDecimal={false}
          maxIntegerDigits={4}
        />

        <Button
          label={t('past.confirm')}
          disabled={startsAt === null || endsAt === null || error !== null}
          onPress={() => {
            if (startsAt === null || endsAt === null || error !== null) return;
            if (pastWorkoutProblem({ startsAt, endsAt, now: Date.now() }) === null) onLog(startsAt, endsAt);
          }}
        />
        <Button variant="quiet" label={t('past.cancel')} onPress={onClose} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[4] },
  field: { gap: space[1] },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] },
});
