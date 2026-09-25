/**
 * The finish summary's composition — task 004 stage 6.
 *
 * The core is replaced here, because it reaches the app as a JSI turbo-module that does not load under Node (the same
 * limit `strength-fixtures.test.ts` records). What the core *computes* is proven in Rust and Python over the shared
 * fixtures; what this proves is what the app **hands it** — which sets, grouped how, judged against which history —
 * because that is the half a mistake here would get wrong without the core ever noticing.
 */
import { countedSetCount, detectPrs, personalBests, volumeKg, type LoggedSet, type PrAchievement } from '@/domain';

import { isWeightRecord, RECORD_KIND_KEY, recordsOf, totalsOf } from '../finish';
import { tickCounts } from '../liveFlow';

jest.mock('@/domain', () => ({
  countedSetCount: jest.fn(() => 0),
  volumeKg: jest.fn(() => 0),
  personalBests: jest.fn(() => ({ maxWeightKg: null, bestE1rmKg: null, bestSessionVolumeKg: null, bestRepsAtWeight: [] })),
  detectPrs: jest.fn(() => []),
}));

function set(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    setType: 'working',
    isCompleted: true,
    weightKg: 100,
    reps: 5,
    rir: 2,
    usesBodyweight: false,
    bodyWeightKg: null,
    isDeload: false,
    ...overrides,
  };
}

function record(kind: PrAchievement['kind']): PrAchievement {
  return { kind, value: 1, weightKg: null, reps: null, rir: null, setIndex: null };
}

beforeEach(() => jest.clearAllMocks());

describe('the workout’s totals', () => {
  it('hands the core every set of every exercise, warm-ups and unticked rows included — it decides what counts (INV-04)', () => {
    const warmup = set({ setType: 'warmup' });
    const unticked = set({ isCompleted: false });
    jest.mocked(countedSetCount).mockReturnValue(1);
    jest.mocked(volumeKg).mockReturnValue(500);

    const totals = totalsOf([
      { exerciseId: 'bench', sets: [warmup, set()] },
      { exerciseId: 'row', sets: [unticked] },
    ]);

    expect(jest.mocked(countedSetCount).mock.calls[0]?.[0]).toEqual([warmup, set(), unticked]);
    expect(jest.mocked(volumeKg).mock.calls[0]?.[0]).toEqual([warmup, set(), unticked]);
    expect(totals).toEqual({ countedSets: 1, volumeKg: 500, untickedSets: 1 });
  });
});

describe('the workout’s records', () => {
  it('judges each exercise against its own history alone, folded by the core (stage 6, decisions 1–2)', () => {
    const benchHistory = [[set({ weightKg: 90 })], [set({ weightKg: 95 })]];
    const rowHistory = [[set({ weightKg: 60 })]];
    const benchSets = [set({ weightKg: 100 })];
    const rowSets = [set({ weightKg: 70 })];
    const historyOf = jest.fn((exerciseId: string) => (exerciseId === 'bench' ? benchHistory : rowHistory));

    recordsOf(
      [
        { exerciseId: 'bench', sets: benchSets },
        { exerciseId: 'row', sets: rowSets },
      ],
      historyOf,
    );

    expect(historyOf.mock.calls).toEqual([['bench'], ['row']]);
    expect(jest.mocked(personalBests).mock.calls).toEqual([[benchHistory], [rowHistory]]);
    expect(jest.mocked(detectPrs).mock.calls.map((call) => call[1])).toEqual([benchSets, rowSets]);
  });

  it('keeps the core’s order within an exercise and the workout’s order across them, each record named by exercise', () => {
    jest
      .mocked(detectPrs)
      .mockReturnValueOnce([record('max_weight'), record('best_session_volume')])
      .mockReturnValueOnce([record('best_e1rm')]);

    const records = recordsOf(
      [
        { exerciseId: 'squat', sets: [set()] },
        { exerciseId: 'bench', sets: [set()] },
      ],
      () => [],
    );

    expect(records.map((entry) => [entry.exerciseId, entry.record.kind])).toEqual([
      ['squat', 'max_weight'],
      ['squat', 'best_session_volume'],
      ['bench', 'best_e1rm'],
    ]);
  });

  it('asks nothing of the core for a workout with no exercises', () => {
    expect(recordsOf([], () => [])).toEqual([]);
    expect(detectPrs).not.toHaveBeenCalled();
  });
});

describe('how a record is worded', () => {
  it('names every kind the core can return, and only reps at a weight is a count', () => {
    expect(Object.keys(RECORD_KIND_KEY).sort()).toEqual(
      ['best_e1rm', 'best_session_volume', 'max_reps_at_weight', 'max_weight'].sort(),
    );
    expect(isWeightRecord('max_weight')).toBe(true);
    expect(isWeightRecord('best_e1rm')).toBe(true);
    expect(isWeightRecord('best_session_volume')).toBe(true);
    expect(isWeightRecord('max_reps_at_weight')).toBe(false);
  });
});

describe('what the finish sheet counts before finishing', () => {
  it('counts ticked and unticked rows — completion only, never what counts', () => {
    let next = 0;
    const live = (isCompleted: boolean, setType: 'working' | 'warmup' = 'working') => ({
      id: `s${String((next += 1))}`,
      setIndex: next,
      setType,
      weightKg: null,
      reps: null,
      rir: null,
      durationS: null,
      distanceM: null,
      isCompleted,
      completedAt: null,
    });
    const workout = {
      id: 'w',
      title: 'Treino',
      startedAt: 0,
      localDate: '2026-09-24',
      tz: 'UTC',
      notes: null,
      perceivedFatigue: null,
      exercises: [
        {
          id: 'we1',
          exerciseId: 'bench',
          orderIndex: 1,
          supersetGroup: null,
          tracking: 'weight_reps' as const,
          notes: null,
          restSeconds: null,
          targetMinReps: null,
          targetMaxReps: null,
          targetRir: null,
          sets: [live(true, 'warmup'), live(true), live(false)],
        },
      ],
    };
    // A ticked warm-up is ticked: whether it *counts* is the summary's question, asked of the core.
    expect(tickCounts(workout)).toEqual({ ticked: 2, unticked: 1 });
  });
});
