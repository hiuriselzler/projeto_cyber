/**
 * The live session, finished off — task 004 stage 5b. The rest timer bar under a fake clock, the set-type sheet and
 * the exercise options sheet, in both languages, both unit systems and both themes.
 *
 * `@/platform` is mocked so the haptic can be counted; `@/db/client` because the options sheet's rest choices reach
 * `@/db/routines`, and `expo-sqlite` cannot open under Node. Nothing here writes.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { MATRIX, renderUi } from '../../../../test/render';
import type { LiveExercise, LiveSet, LiveWorkout } from '@/db/strength';
import { restOverTap } from '@/platform';

import { ExerciseOptionsSheet } from '../ExerciseOptionsSheet';
import { RestTimerBar } from '../RestTimerBar';
import { SetTypeSheet } from '../SetTypeSheet';

jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));
jest.mock('@/platform', () => ({ restOverTap: jest.fn(), confirmTap: jest.fn() }));

const T0 = Date.UTC(2026, 8, 23, 18, 0, 0);
const TITLE = 'Supino reto';

function done(completedAt: number): LiveSet {
  return {
    id: 'A1',
    setIndex: 1,
    setType: 'working',
    weightKg: 60,
    reps: 8,
    rir: 2,
    durationS: null,
    distanceM: null,
    isCompleted: true,
    completedAt,
  };
}

function resting(restSeconds: number | null, completedAt = T0): LiveWorkout {
  const exercise: LiveExercise = {
    id: 'A',
    exerciseId: 'e-bench',
    orderIndex: 1,
    supersetGroup: null,
    tracking: 'weight_reps',
    restSeconds,
    targetMinReps: null,
    targetMaxReps: null,
    targetRir: null,
    sets: [done(completedAt), { ...done(completedAt), id: 'A2', setIndex: 2, isCompleted: false, completedAt: null }],
  };
  return { id: 'w', title: 'Treino', startedAt: T0, localDate: '2026-09-23', tz: 'UTC', exercises: [exercise] };
}

/** Two completed sets, the second at `secondAt`, so the rest after it is the one running. */
function twoDone(secondAt: number, restSeconds: number): LiveWorkout {
  const workout = resting(restSeconds);
  const [exercise] = workout.exercises;
  if (exercise === undefined) return workout;
  return {
    ...workout,
    exercises: [{ ...exercise, sets: [done(T0), { ...done(secondAt), id: 'A2', setIndex: 2 }] }],
  };
}

/** The bar over one workout, then — on a press — over another, the way a re-read after an un-tick replaces it. */
function Swapping({ first, second }: { readonly first: LiveWorkout; readonly second: LiveWorkout }) {
  const [workout, setWorkout] = useState(first);
  return (
    <>
      <Pressable testID="swap" onPress={() => setWorkout(second)} />
      <RestTimerBar workout={workout} skippedRest={null} onLess={noop} onMore={noop} onSkip={noop} />
    </>
  );
}

function noop() {
  // Reported upwards; the test does not care what the caller does with it.
}

describe.each(MATRIX)('$locale, $unitSystem, $preference', (setting) => {
  const pt = setting.locale === 'pt-BR';

  describe('the rest timer bar (07 §6, decision 2)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(T0 + 10_000);
      jest.mocked(restOverTap).mockClear();
    });
    afterEach(() => jest.useRealTimers());

    it('counts down from the rows, and is felt once at the end — then gone', async () => {
      await renderUi(<RestTimerBar workout={resting(30)} skippedRest={null} onLess={noop} onMore={noop} onSkip={noop} />, setting);
      expect(screen.getByText('0:20')).toBeOnTheScreen();

      await act(() => jest.advanceTimersByTime(10_000));
      expect(screen.getByText('0:10')).toBeOnTheScreen();
      expect(restOverTap).not.toHaveBeenCalled();

      await act(() => jest.advanceTimersByTime(10_250));
      expect(screen.queryByText(/0:0\d/)).toBeNull();
      expect(restOverTap).toHaveBeenCalledTimes(1);

      await act(() => jest.advanceTimersByTime(60_000));
      expect(restOverTap).toHaveBeenCalledTimes(1);
    });

    it('draws nothing when the exercise has no rest — never an invented default (decision 1)', async () => {
      await renderUi(<RestTimerBar workout={resting(null)} skippedRest={null} onLess={noop} onMore={noop} onSkip={noop} />, setting);
      expect(screen.queryByText(pt ? 'Descanso' : 'Rest')).toBeNull();
    });

    it('draws nothing once that set’s rest was skipped', async () => {
      await renderUi(<RestTimerBar workout={resting(30)} skippedRest="A1" onLess={noop} onMore={noop} onSkip={noop} />, setting);
      expect(screen.queryByText('0:20')).toBeNull();
    });

    it('never buzzes for a rest that ended while its clock was stopped', async () => {
      // The clock runs only while a rest does. A 30 s rest ends and is felt; the clock stops. Forty seconds later an
      // un-tick makes an older set the latest again, whose rest ended — in real time — while nothing was watching.
      // It must end silently, not buzz a stale "rest over" at a lifter already mid-set.
      await renderUi(<Swapping first={resting(30)} second={twoDone(T0 + 30_000, 30)} />, setting);
      await act(() => jest.advanceTimersByTime(20_250));
      expect(restOverTap).toHaveBeenCalledTimes(1);

      await act(() => jest.advanceTimersByTime(40_000));
      await fireEvent.press(screen.getByTestId('swap'));
      await act(() => jest.advanceTimersByTime(1_000));
      expect(restOverTap).toHaveBeenCalledTimes(1);
    });

    it('says the time left as one element, and offers −15 s, +15 s and skip', async () => {
      const onLess = jest.fn();
      const onMore = jest.fn();
      const onSkip = jest.fn();
      await renderUi(<RestTimerBar workout={resting(30)} skippedRest={null} onLess={onLess} onMore={onMore} onSkip={onSkip} />, setting);

      expect(screen.getByLabelText(pt ? 'Descanso, faltam 0:20' : 'Rest, 0:20 left')).toBeOnTheScreen();
      await fireEvent.press(screen.getByText('−15 s'));
      await fireEvent.press(screen.getByText('+15 s'));
      await fireEvent.press(screen.getByText(pt ? 'Pular' : 'Skip'));
      expect([onLess, onMore, onSkip].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
    });
  });

  describe('the set-type sheet (FR-2.9, decision 5)', () => {
    it('offers every type by name and reports the one chosen', async () => {
      const onChoose = jest.fn();
      await renderUi(
        <SetTypeSheet visible setNumber={2} setType="working" onChoose={onChoose} onRemove={noop} onClose={noop} />,
        setting,
      );
      expect(screen.getByText(pt ? 'Série 2' : 'Set 2')).toBeOnTheScreen();
      await fireEvent.press(screen.getByText(pt ? 'Aquecimento' : 'Warm-up'));
      expect(onChoose).toHaveBeenCalledWith('warmup');
    });

    it('says which types count, and removes the set from its own menu (FR-2.8)', async () => {
      const onRemove = jest.fn();
      await renderUi(
        <SetTypeSheet visible setNumber={2} setType="working" onChoose={noop} onRemove={onRemove} onClose={noop} />,
        setting,
      );
      expect(screen.getByText(pt ? /não entram no volume/ : /not counted in volume/)).toBeOnTheScreen();
      await fireEvent.press(screen.getByText(pt ? 'Remover esta série' : 'Remove this set'));
      expect(onRemove).toHaveBeenCalledTimes(1);
    });
  });

  describe('the exercise options sheet (FR-2.6, FR-2.8)', () => {
    const base = {
      visible: true,
      title: TITLE,
      restSeconds: null,
      isFirst: true,
      isLast: false,
      linkedBelow: false,
      onRest: noop,
      onMove: noop,
      onToggleSuperset: noop,
      onRemove: noop,
      onClose: noop,
    } as const;

    it('sets this exercise’s rest, or turns the timer off', async () => {
      const onRest = jest.fn();
      await renderUi(<ExerciseOptionsSheet {...base} restSeconds={120} onRest={onRest} />, setting);
      await fireEvent.press(screen.getByText('1:30'));
      await fireEvent.press(screen.getByText(pt ? 'Desligado' : 'Off'));
      expect(onRest.mock.calls).toEqual([[90], [null]]);
    });

    it('cannot move the first exercise up, and moves it down', async () => {
      const onMove = jest.fn();
      await renderUi(<ExerciseOptionsSheet {...base} onMove={onMove} />, setting);
      await fireEvent.press(screen.getByText(pt ? 'Mover para cima' : 'Move up'));
      await fireEvent.press(screen.getByText(pt ? 'Mover para baixo' : 'Move down'));
      expect(onMove.mock.calls).toEqual([[1]]);
    });

    it('unlinks from the next exercise when already linked', async () => {
      const onToggleSuperset = jest.fn();
      await renderUi(<ExerciseOptionsSheet {...base} linkedBelow onToggleSuperset={onToggleSuperset} />, setting);
      await fireEvent.press(screen.getByText(pt ? 'Desfazer superset com o próximo' : 'Unlink from the next'));
      expect(onToggleSuperset).toHaveBeenCalledTimes(1);
    });

    it('offers no superset on the last exercise — there is nothing below it to link to', async () => {
      await renderUi(<ExerciseOptionsSheet {...base} isLast />, setting);
      expect(screen.queryByText(pt ? 'Superset com o próximo' : 'Superset with the next')).toBeNull();
    });
  });
});
