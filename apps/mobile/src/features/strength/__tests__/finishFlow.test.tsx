/**
 * The finish flow — task 004 stage 6: the finish sheet, a past workout's sheet, an exercise's note, and the summary
 * with its records — in both languages, both unit systems and both themes.
 *
 * The summary's records come from the core, which does not load under Node, so it is replaced here; what the core
 * computes is proven in Rust and Python over the shared fixtures, and what the app hands it in `finish.test.ts`.
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { MATRIX, renderUi } from '../../../../test/render';
import { readExercise } from '@/db/catalog';
import { readExerciseHistory, readFinishedWorkout, readWorkoutSets } from '@/db/history';
import { detectPrs, type PrAchievement } from '@/domain';
import { recordTap } from '@/platform';

import { ExerciseOptionsSheet } from '../ExerciseOptionsSheet';
import { FinishSheet } from '../FinishSheet';
import { atMinutes, dayStart } from '../pastWorkout';
import { PastWorkoutSheet } from '../PastWorkoutSheet';
import { WorkoutSummaryScreen } from '../WorkoutSummaryScreen';

jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));
jest.mock('@/platform', () => ({ recordTap: jest.fn(), confirmTap: jest.fn(), restOverTap: jest.fn() }));
jest.mock('@/db/history', () => ({
  readFinishedWorkout: jest.fn(),
  readWorkoutSets: jest.fn(() => []),
  readExerciseHistory: jest.fn(() => []),
}));
jest.mock('@/db/catalog', () => ({ readExercise: jest.fn() }));
jest.mock('@/domain', () => ({
  countedSetCount: jest.fn(() => 4),
  volumeKg: jest.fn(() => 2000),
  personalBests: jest.fn(() => ({ maxWeightKg: null, bestE1rmKg: null, bestSessionVolumeKg: null, bestRepsAtWeight: [] })),
  detectPrs: jest.fn(() => []),
}));
jest.mock('../useLiveWorkout', () => ({ useSignedInUserId: () => 'user-1' }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

/** 21:00 on 24 September 2026, where the test runs — the device's own zone, as the sheet reads it. */
const NOW = new Date(2026, 8, 24, 21, 0).getTime();

const WORDS = {
  en: {
    ticked: '3 sets ticked',
    unticked: '2 sets not ticked. They stay as they are and count for nothing.',
    finish: 'Finish',
    discard: 'Discard this workout',
    fatigue: (value: number) => `Fatigue ${String(value)} of 10`,
    notes: 'Notes on this workout',
    exerciseNotes: 'Notes',
    logIt: 'Log it',
    earlier: 'Earlier day',
    start: 'Started at, not set',
    end: 'Ended at, not set',
    endBeforeStart: 'The end must be after the start.',
    inFuture: 'That has not happened yet.',
    noRecords: 'No new records this time.',
    heaviest: 'Heaviest weight',
    recordsTitle: 'New personal record',
    done: 'Done',
    summaryTitle: 'Workout finished',
  },
  'pt-BR': {
    ticked: '3 séries marcadas',
    unticked: '2 séries não marcadas. Elas ficam como estão e não contam para nada.',
    finish: 'Finalizar',
    discard: 'Descartar este treino',
    fatigue: (value: number) => `Cansaço ${String(value)} de 10`,
    notes: 'Notas sobre este treino',
    exerciseNotes: 'Notas',
    logIt: 'Registrar',
    earlier: 'Dia anterior',
    start: 'Começou às, não definido',
    end: 'Terminou às, não definido',
    endBeforeStart: 'O fim precisa ser depois do início.',
    inFuture: 'Isso ainda não aconteceu.',
    noRecords: 'Nenhum recorde novo desta vez.',
    heaviest: 'Maior carga',
    recordsTitle: 'Novo recorde pessoal',
    done: 'Concluir',
    summaryTitle: 'Treino finalizado',
  },
} as const;

function noop() {
  // Most tests do not care what the caller does with a report.
}

const FINISH_BASE = {
  visible: true,
  ticked: 3,
  unticked: 0,
  fatigue: null,
  notes: null,
  onFatigue: noop,
  onNotes: noop,
  onFinish: noop,
  onDiscard: noop,
  onClose: noop,
} as const;

async function typeDigits(digits: string) {
  for (const digit of digits) {
    await fireEvent.press(screen.getByRole('button', { name: digit }));
  }
}

describe('the past workout’s day and times', () => {
  it('steps back whole days from local midnight, whatever the clock says', () => {
    expect(dayStart(NOW, 0)).toBe(new Date(2026, 8, 24).getTime());
    expect(dayStart(NOW, 1)).toBe(new Date(2026, 8, 23).getTime());
    expect(dayStart(NOW, 30)).toBe(new Date(2026, 7, 25).getTime());
  });

  it('places a time of day on that day, where the device is', () => {
    expect(atMinutes(dayStart(NOW, 1), 18 * 60 + 30)).toBe(new Date(2026, 8, 23, 18, 30).getTime());
  });
});

describe.each(MATRIX)('$locale, $unitSystem, $preference', (setting) => {
  const words = WORDS[setting.locale];

  describe('the finish sheet', () => {
    it('counts what was ticked, and says what happens to what was not — kept, counting for nothing', async () => {
      await renderUi(<FinishSheet {...FINISH_BASE} unticked={2} />, setting);
      expect(screen.getByText(words.ticked)).toBeOnTheScreen();
      expect(screen.getByText(words.unticked)).toBeOnTheScreen();
    });

    it('records fatigue with one tap', async () => {
      const onFatigue = jest.fn();
      await renderUi(<FinishSheet {...FINISH_BASE} onFatigue={onFatigue} />, setting);
      await fireEvent.press(screen.getByRole('radio', { name: words.fatigue(7) }));
      expect(onFatigue).toHaveBeenLastCalledWith(7);
    });

    it('clears fatigue with a second tap on the chosen chip — back to not recorded, never a 0 (INV-03)', async () => {
      const onFatigue = jest.fn();
      await renderUi(<FinishSheet {...FINISH_BASE} fatigue={7} onFatigue={onFatigue} />, setting);
      expect(screen.getByRole('radio', { name: words.fatigue(7) })).toBeChecked();
      await fireEvent.press(screen.getByRole('radio', { name: words.fatigue(7) }));
      expect(onFatigue).toHaveBeenLastCalledWith(null);
    });

    it('writes the note as it is typed, exactly as typed (INV-09, INV-27)', async () => {
      const onNotes = jest.fn();
      await renderUi(<FinishSheet {...FINISH_BASE} onNotes={onNotes} />, setting);
      await fireEvent.changeText(screen.getByLabelText(words.notes), '  pegada fechada');
      expect(onNotes).toHaveBeenCalledWith('  pegada fechada');
    });

    it('finishes a workout with something ticked, and offers no discard beside it', async () => {
      const onFinish = jest.fn();
      await renderUi(<FinishSheet {...FINISH_BASE} onFinish={onFinish} />, setting);
      expect(screen.queryByRole('button', { name: words.discard })).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: words.finish }));
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it('with nothing ticked, offers to discard instead — never both (decision 7)', async () => {
      const onDiscard = jest.fn();
      await renderUi(<FinishSheet {...FINISH_BASE} ticked={0} unticked={4} onDiscard={onDiscard} />, setting);
      expect(screen.queryByRole('button', { name: words.finish })).toBeNull();
      // No "0 série marcada": the plural rule reads wrong in pt-BR, and the sentence below already says it (device pass).
      expect(screen.queryByText(/^0 /)).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: words.discard }));
      expect(onDiscard).toHaveBeenCalledTimes(1);
    });
  });

  describe('an exercise’s note (FR-2.8)', () => {
    it('is written as it is typed, and starts from what is stored', async () => {
      const onNotes = jest.fn();
      const title = 'Supino reto';
      await renderUi(
        <ExerciseOptionsSheet
          visible
          title={title}
          restSeconds={null}
          isFirst
          isLast
          linkedBelow={false}
          notes="ombro ok"
          onNotes={onNotes}
          onRest={noop}
          onMove={noop}
          onToggleSuperset={noop}
          onRemove={noop}
          onClose={noop}
        />,
        setting,
      );
      const field = screen.getByLabelText(words.exerciseNotes);
      expect(field.props.value).toBe('ombro ok');
      await fireEvent.changeText(field, 'ombro ok, pegada aberta');
      expect(onNotes).toHaveBeenCalledWith('ombro ok, pegada aberta');
    });
  });

  describe('a past workout’s sheet (FR-2.13)', () => {
    beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
    afterEach(() => jest.restoreAllMocks());

    it('starts with both times blank, and logs nothing until both are typed', async () => {
      const onLog = jest.fn();
      await renderUi(<PastWorkoutSheet visible onLog={onLog} onClose={noop} />, setting);
      expect(screen.getByRole('radio', { name: words.start })).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: words.end })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: words.logIt })).toBeDisabled();
      await fireEvent.press(screen.getByRole('button', { name: words.logIt }));
      expect(onLog).not.toHaveBeenCalled();
    });

    it('logs the typed start and end on the chosen day, where the device is', async () => {
      const onLog = jest.fn();
      await renderUi(<PastWorkoutSheet visible onLog={onLog} onClose={noop} />, setting);
      await fireEvent.press(screen.getByRole('button', { name: words.earlier }));
      await typeDigits('1800');
      await fireEvent.press(screen.getByRole('radio', { name: words.end }));
      await typeDigits('1930');
      await fireEvent.press(screen.getByRole('button', { name: words.logIt }));
      expect(onLog).toHaveBeenCalledWith(new Date(2026, 8, 23, 18, 0).getTime(), new Date(2026, 8, 23, 19, 30).getTime());
    });

    it('refuses an end before the start, in words', async () => {
      const onLog = jest.fn();
      await renderUi(<PastWorkoutSheet visible onLog={onLog} onClose={noop} />, setting);
      await typeDigits('1800');
      await fireEvent.press(screen.getByRole('radio', { name: words.end }));
      await typeDigits('1700');
      expect(screen.getByText(words.endBeforeStart)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: words.logIt })).toBeDisabled();
    });

    it('refuses a workout that has not ended yet', async () => {
      await renderUi(<PastWorkoutSheet visible onLog={noop} onClose={noop} />, setting);
      await typeDigits('2000');
      await fireEvent.press(screen.getByRole('radio', { name: words.end }));
      await typeDigits('2200');
      expect(screen.getByText(words.inFuture)).toBeOnTheScreen();
    });
  });

  describe('the summary', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      jest.mocked(readFinishedWorkout).mockReturnValue({
        id: 'w1',
        title: 'Treino A',
        startedAt: NOW - 3_600_000,
        endedAt: NOW,
        localDate: '2026-09-24',
        notes: null,
        perceivedFatigue: null,
      });
      jest.mocked(readWorkoutSets).mockReturnValue([{ exerciseId: 'e-mine', sets: [] }]);
      jest.mocked(readExercise).mockReturnValue({
        id: 'e-mine',
        nameKey: null,
        name: 'Supino do João',
      } as ReturnType<typeof readExercise>);
    });

    it('states each record as a fact, naming the user’s own exercise exactly as typed — and buzzes once', async () => {
      const heaviest: PrAchievement = { kind: 'max_weight', value: 110, weightKg: 110, reps: 3, rir: 1, setIndex: 0 };
      jest.mocked(detectPrs).mockReturnValue([heaviest]);
      await renderUi(<WorkoutSummaryScreen workoutId="w1" />, setting);

      expect(screen.getByRole('header', { name: words.recordsTitle })).toBeOnTheScreen();
      expect(screen.getByText(words.heaviest)).toBeOnTheScreen();
      expect(screen.getByText('Supino do João')).toBeOnTheScreen();
      // Judged against every other finished workout of the exercise, never this one (decision 2).
      expect(readExerciseHistory).toHaveBeenCalledWith({ userId: 'user-1', exerciseId: 'e-mine', exceptWorkoutId: 'w1' });
      expect(recordTap).toHaveBeenCalledTimes(1);
    });

    it('says plainly when there is no record, and does not buzz', async () => {
      jest.mocked(detectPrs).mockReturnValue([]);
      await renderUi(<WorkoutSummaryScreen workoutId="w1" />, setting);

      expect(screen.getByText(words.noRecords)).toBeOnTheScreen();
      expect(recordTap).not.toHaveBeenCalled();
    });

    it('goes home when done', async () => {
      await renderUi(<WorkoutSummaryScreen workoutId="w1" />, setting);
      expect(screen.getByRole('header', { name: words.summaryTitle })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: words.done }));
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });
});
