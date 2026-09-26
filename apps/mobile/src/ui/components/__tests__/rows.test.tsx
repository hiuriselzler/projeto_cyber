/**
 * The set row, the cycle cell and the track row, in both languages, both unit systems and both themes (task 011).
 */
import { fireEvent, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { MATRIX, renderUi, type Setting } from '../../../../test/render';
import { KILOGRAMS_PER_POUND } from '../../format/quantities';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { trackHue } from '../../theme/hues';
import { resolveScheme, ThemeProvider } from '../../theme/ThemeProvider';
import { sizes, typography } from '../../tokens';
import { CycleCell, type CycleStatus } from '../CycleCell';
import { SetRow } from '../SetRow';
import { TrackRow } from '../TrackRow';

/** A load stored at `numeric(9,4)` (INV-02): 40 kg for a metric lifter, 135 lb for an imperial one. */
function loadFor({ unitSystem }: Setting): number {
  return unitSystem === 'imperial' ? Math.round(135 * KILOGRAMS_PER_POUND * 10_000) / 10_000 : 40;
}

/** That load, as each language and unit system shows it and says it. */
const LOAD = {
  en: {
    metric: { text: '40', unit: 'kg', spoken: '40 kilograms' },
    imperial: { text: '135', unit: 'lb', spoken: '135 pounds' },
  },
  'pt-BR': {
    metric: { text: '40', unit: 'kg', spoken: '40 quilogramas' },
    imperial: { text: '135', unit: 'lb', spoken: '135 libras' },
  },
} as const;

/** What depends on the language; a sentence takes the load as the unit system says it. */
const WORDS = {
  en: {
    sentence: (weight: string) => `Set 3, ${weight}, 6 reps, RIR 2, incomplete`,
    sentenceNoRir: (weight: string) => `Set 3, ${weight}, 6 reps, RIR not recorded, incomplete`,
    sentenceComplete: (weight: string) => `Set 3, ${weight}, 6 reps, RIR 2, complete`,
    sentenceWarmup: (weight: string) => `Set 3, Warm-up, ${weight}, 6 reps, RIR 2, incomplete`,
    warmupLetter: 'W',
    previous: (weight: string) => `${weight} × 6 @2 last time`,
    day: 'Day 3',
    completedCell: 'Day 3, Completed',
    deloadCell: 'Day 3, Projected, deload',
    deload: 'Deload',
    level: 'Level 12',
    xp: '1,250 / 2,000 XP',
    trackLabel: 'strength, level 12, 1,250 of 2,000 XP. reason',
    topXp: '48,000 XP',
  },
  'pt-BR': {
    sentence: (weight: string) => `Série 3, ${weight}, 6 repetições, RIR 2, não concluída`,
    sentenceNoRir: (weight: string) => `Série 3, ${weight}, 6 repetições, RIR não registrado, não concluída`,
    sentenceComplete: (weight: string) => `Série 3, ${weight}, 6 repetições, RIR 2, concluída`,
    sentenceWarmup: (weight: string) => `Série 3, Aquecimento, ${weight}, 6 repetições, RIR 2, não concluída`,
    warmupLetter: 'Aq',
    previous: (weight: string) => `Última vez: ${weight} × 6 @2`,
    day: 'Dia 3',
    completedCell: 'Dia 3, Concluído',
    deloadCell: 'Dia 3, Projetado, deload',
    deload: 'Deload',
    level: 'Nível 12',
    xp: '1.250 / 2.000 XP',
    trackLabel: 'strength, nível 12, 1.250 de 2.000 XP. reason',
    topXp: '48.000 XP',
  },
} as const;

describe.each(MATRIX)('$locale, $unitSystem, $preference', (setting) => {
  const words = WORDS[setting.locale];
  const load = loadFor(setting);
  const shown = LOAD[setting.locale][setting.unitSystem];

  describe('set row', () => {
    const base = { setNumber: 3, weightKg: load, reps: 6, rir: 2, completed: false } as const;

    it('reads as one sentence, and shows the weight in the user’s unit in tabular figures', async () => {
      await renderUi(<SetRow {...base} onEdit={jest.fn()} onToggleComplete={jest.fn()} />, setting);

      expect(screen.getByLabelText(words.sentence(shown.spoken))).toHaveStyle({ minHeight: sizes.targetWorkout });
      expect(screen.getByText(shown.text)).toHaveStyle({ fontVariant: ['tabular-nums'], fontSize: typography.metricLg.fontSize });
      expect(screen.getByText(shown.unit)).toBeOnTheScreen();
    });

    it('says a blank RIR is not recorded, never 0 (INV-03)', async () => {
      await renderUi(<SetRow {...base} rir={null} onEdit={jest.fn()} onToggleComplete={jest.fn()} />, setting);

      expect(screen.getByLabelText(words.sentenceNoRir(shown.spoken))).toBeOnTheScreen();
      expect(screen.queryByText('RIR 0')).toBeNull();
    });

    it('shows completion with a check mark, not by colour alone (INV-24)', async () => {
      const { rerender } = await renderUi(<SetRow {...base} onEdit={jest.fn()} onToggleComplete={jest.fn()} />, setting);
      expect(screen.queryByTestId('icon-check')).toBeNull();

      await rerender(
        <InSetting setting={setting}>
          <SetRow {...base} completed onEdit={jest.fn()} onToggleComplete={jest.fn()} />
        </InSetting>,
      );
      expect(screen.getByTestId('icon-check')).toBeOnTheScreen();
      expect(screen.getByLabelText(words.sentenceComplete(shown.spoken))).toBeOnTheScreen();
    });

    it('keeps last time’s performance visible', async () => {
      const previous = { weightKg: load, reps: 6, rir: 2 };
      await renderUi(<SetRow {...base} previous={previous} onEdit={jest.fn()} onToggleComplete={jest.fn()} />, setting);

      expect(screen.getByText(words.previous(shown.text))).toBeOnTheScreen();
    });

    it('edits each field and completes the set, by touch and by screen-reader action', async () => {
      const onEdit = jest.fn();
      const onToggleComplete = jest.fn();
      await renderUi(<SetRow {...base} onEdit={onEdit} onToggleComplete={onToggleComplete} />, setting);

      await fireEvent.press(screen.getByTestId('set-row-weight'));
      await fireEvent.press(screen.getByTestId('set-row-reps'));
      await fireEvent.press(screen.getByTestId('set-row-rir'));
      await fireEvent.press(screen.getByTestId('set-row-complete'));
      expect(onEdit.mock.calls).toEqual([['weight'], ['reps'], ['rir']]);
      expect(onToggleComplete).toHaveBeenCalledTimes(1);

      const row = screen.getByLabelText(words.sentence(shown.spoken));
      await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'editReps' } });
      await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
      expect(onEdit).toHaveBeenLastCalledWith('reps');
      expect(onToggleComplete).toHaveBeenCalledTimes(2);
    });
  });

  describe('set row, by type (FR-2.9, task 004 stage 5b)', () => {
    const base = { setNumber: 3, weightKg: load, reps: 6, rir: 2, completed: false } as const;

    it('shows a working set by its number, and says nothing extra about its type', async () => {
      await renderUi(<SetRow {...base} setType="working" onEdit={jest.fn()} onToggleComplete={jest.fn()} />, setting);

      expect(screen.getByText('3')).toBeOnTheScreen();
      expect(screen.getByLabelText(words.sentence(shown.spoken))).toBeOnTheScreen();
    });

    it('shows any other type by its letter in the number’s place, and says the type aloud — never colour alone (INV-24)', async () => {
      await renderUi(<SetRow {...base} setType="warmup" onEdit={jest.fn()} onToggleComplete={jest.fn()} />, setting);

      expect(screen.getByText(words.warmupLetter)).toBeOnTheScreen();
      expect(screen.queryByText('3')).toBeNull();
      expect(screen.getByLabelText(words.sentenceWarmup(shown.spoken))).toBeOnTheScreen();
    });

    it('opens the type choice from the number, by tap, by long-press and by screen-reader action (07 §5)', async () => {
      const onChangeType = jest.fn();
      await renderUi(
        <SetRow {...base} onEdit={jest.fn()} onToggleComplete={jest.fn()} onChangeType={onChangeType} />,
        setting,
      );

      await fireEvent.press(screen.getByTestId('set-row-type'));
      await fireEvent(screen.getByTestId('set-row-type'), 'longPress');
      await fireEvent(screen.getByLabelText(words.sentence(shown.spoken)), 'accessibilityAction', {
        nativeEvent: { actionName: 'changeType' },
      });
      expect(onChangeType).toHaveBeenCalledTimes(3);
    });

    it('offers no type action at all when the caller gives no way to change it', async () => {
      await renderUi(<SetRow {...base} onEdit={jest.fn()} onToggleComplete={jest.fn()} />, setting);

      const actions = screen.getByLabelText(words.sentence(shown.spoken)).props.accessibilityActions as { name: string }[];
      expect(actions.map((action) => action.name)).not.toContain('changeType');
    });
  });

  describe('set row, by tracking mode (FR-2.3, task 004 stage 5c)', () => {
    const pt = setting.locale === 'pt-BR';
    const common = { setNumber: 1, completed: false, onEdit: jest.fn(), onToggleComplete: jest.fn() } as const;

    it('shows a hold as a time alone — no weight, no reps, and no RIR, which a hold does not have (INV-03)', async () => {
      await renderUi(<SetRow {...common} tracking="duration" weightKg={null} reps={null} rir={null} durationS={90} />, setting);

      expect(screen.getByText('1:30')).toHaveStyle({ fontVariant: ['tabular-nums'] });
      expect(screen.queryByTestId('set-row-weight')).toBeNull();
      expect(screen.queryByTestId('set-row-reps')).toBeNull();
      expect(screen.queryByTestId('set-row-rir')).toBeNull();
      expect(
        screen.getByLabelText(pt ? 'Série 1, 1 minuto e 30 segundos, não concluída' : 'Set 1, 1 minute 30 seconds, incomplete'),
      ).toBeOnTheScreen();
    });

    it('shows a carry as weight, distance and time, the distance in the user’s own unit (INV-01)', async () => {
      await renderUi(
        <SetRow {...common} tracking="distance_duration" weightKg={load} reps={null} rir={null} distanceM={30.48} durationS={40} />,
        setting,
      );

      const distance = setting.unitSystem === 'imperial' ? '100' : pt ? '30,5' : '30.5';
      expect(screen.getByText(distance)).toBeOnTheScreen();
      expect(screen.getByText(setting.unitSystem === 'imperial' ? 'ft' : 'm')).toBeOnTheScreen();
      expect(screen.getByText('0:40')).toBeOnTheScreen();
      expect(screen.queryByTestId('set-row-rir')).toBeNull();
      expect(screen.queryByText('×')).toBeNull();
    });

    it('shows a reps-only set without a weight field, and names the reps', async () => {
      await renderUi(<SetRow {...common} tracking="reps_only" weightKg={null} reps={12} rir={2} />, setting);

      expect(screen.queryByTestId('set-row-weight')).toBeNull();
      expect(screen.getByText(pt ? 'repetições' : 'reps')).toBeOnTheScreen();
      expect(screen.getByText('RIR 2')).toBeOnTheScreen();
    });

    it('offers exactly the edit actions its mode has, by touch and by screen reader', async () => {
      const onEdit = jest.fn();
      await renderUi(
        <SetRow {...common} onEdit={onEdit} tracking="distance_duration" weightKg={null} reps={null} rir={null} />,
        setting,
      );
      await fireEvent.press(screen.getByTestId('set-row-distance'));
      await fireEvent.press(screen.getByTestId('set-row-time'));
      expect(onEdit.mock.calls).toEqual([['distance'], ['time']]);

      const row = screen.getByLabelText(pt ? /Série 1, sem carga, sem distância, sem tempo/ : /Set 1, no weight, no distance, no time/);
      const actions = (row.props.accessibilityActions as { name: string }[]).map((action) => action.name);
      expect(actions).toEqual(['activate', 'editWeight', 'editDistance', 'editDuration']);
    });

    it('says last time in the mode’s own terms', async () => {
      await renderUi(
        <SetRow {...common} tracking="duration" weightKg={null} reps={null} rir={null} previous={{ weightKg: null, reps: null, rir: null, durationS: 45 }} />,
        setting,
      );
      expect(screen.getByText(pt ? 'Última vez: 0:45' : '0:45 last time')).toBeOnTheScreen();
    });
  });

  describe('cycle cell', () => {
    it('names the day by its index in the cycle and the status in words (INV-25)', async () => {
      await renderUi(<CycleCell dayIndex={3} status="completed" />, setting);

      expect(screen.getByRole('button', { name: words.completedCell })).toBeOnTheScreen();
      expect(screen.getByText(words.day)).toBeOnTheScreen();
    });

    it('gives every status its own shape (INV-24)', async () => {
      const statuses: CycleStatus[] = ['projected', 'locked', 'in_progress', 'completed', 'skipped'];
      const icons = new Set<string>();
      for (const status of statuses) {
        const { unmount } = await renderUi(<CycleCell dayIndex={1} status={status} />, setting);
        icons.add(String(screen.getByTestId(/^icon-/).props.testID));
        await unmount();
      }
      expect(icons.size).toBe(statuses.length);
    });

    it('marks a deload cycle in words as well as by colour', async () => {
      await renderUi(<CycleCell dayIndex={3} status="projected" deload />, setting);

      expect(screen.getByRole('button', { name: words.deloadCell })).toBeOnTheScreen();
      expect(screen.getByText(words.deload)).toBeOnTheScreen();
    });
  });

  describe('track row', () => {
    const name = 'strength';
    const reason = 'reason';

    it('states level and progress in words and numbers, with the hue as one signal among several', async () => {
      await renderUi(<TrackRow name={name} hue="strength" level={12} xp={1250} nextLevelXp={2000} lastAward={reason} />, setting);

      expect(screen.getByLabelText(words.trackLabel)).toBeOnTheScreen();
      expect(screen.getByText(words.level)).toBeOnTheScreen();
      expect(screen.getByText(words.xp)).toBeOnTheScreen();
      expect(screen.getByText(reason)).toBeOnTheScreen();
    });

    it('shows the top level without a next threshold', async () => {
      await renderUi(<TrackRow name={name} hue="quality" level={30} xp={48000} nextLevelXp={null} />, setting);

      const scheme = resolveScheme(setting.preference, null);
      expect(screen.getByText(words.topXp)).toBeOnTheScreen();
      expect(screen.getByTestId('track-row-hue')).toHaveStyle({ backgroundColor: trackHue(scheme, 'quality', 30) });
    });

    it.each([6, 15])('works as a list of %i rows', async (count) => {
      const names = Array.from({ length: count }, (_, index) => `track ${index + 1}`);
      await renderUi(
        <View>
          {names.map((trackName, index) => (
            <TrackRow key={trackName} name={trackName} hue="quality" level={index + 1} xp={index * 100} nextLevelXp={2000} />
          ))}
        </View>,
        setting,
      );

      expect(screen.getAllByTestId('track-row-hue')).toHaveLength(count);
      names.forEach((trackName) => expect(screen.getByText(trackName)).toBeOnTheScreen());
    });
  });
});

/** Rerendering replaces the whole tree, so the providers come back with it. */
function InSetting({ setting, children }: { setting: Setting; children: ReactNode }) {
  return (
    <ThemeProvider preference={setting.preference}>
      <LocaleProvider locale={setting.locale} unitSystem={setting.unitSystem}>
        {children}
      </LocaleProvider>
    </ThemeProvider>
  );
}
