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
