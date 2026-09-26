/**
 * The history screens' arithmetic — task 004 stage 7 — which is the core's: this suite checks what the app hands
 * `session_metrics()` and what it does with the answer. The core does not load under Node, so it is replaced here; what
 * it computes is proven in Rust and Python over `session_metrics.json`.
 */
import type { DatedSession, PerformedSet } from '@/db/history';
import { sessionMetrics, type LoggedSet, type SessionMetrics } from '@/domain';
import { createI18n } from '@/ui/i18n/i18n';
import { KILOGRAMS_PER_POUND, type useT } from '@/ui';

import { chartQuantity, exerciseCharts, hasValues, isCharted, listRows, setLine } from '../history';

jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));
jest.mock('@/domain', () => ({ sessionMetrics: jest.fn() }));

const metrics = sessionMetrics as jest.MockedFunction<typeof sessionMetrics>;

function measured(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  return { topLoadKg: 100, bestE1rmKg: 120, volumeKg: 1000, countedSets: 2, ...overrides };
}

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

function session(workoutId: string, localDate: string, sets: LoggedSet[] = [set()]): DatedSession {
  return { workoutId, title: 'Treino A', startedAt: 0, localDate, performed: [], sets };
}

function tOf(locale: 'en' | 'pt-BR') {
  return createI18n(locale).t as unknown as ReturnType<typeof useT>;
}

beforeEach(() => jest.clearAllMocks());

describe('the history list', () => {
  it('totals a whole page in one crossing of the core, in the page’s order', () => {
    metrics.mockReturnValue([measured({ countedSets: 3, volumeKg: 1500 }), measured({ countedSets: 0, volumeKg: null })]);
    const first = [set()];
    const rows = listRows(
      [
        { id: 'w2', title: 'B', startedAt: 2, localDate: '2026-09-23' },
        { id: 'w1', title: 'A', startedAt: 1, localDate: '2026-09-20' },
      ],
      new Map([['w2', first]]),
    );
    expect(metrics).toHaveBeenCalledTimes(1);
    // A workout with no set reaches the core as an empty session, never skipped — the positions must line up.
    expect(metrics).toHaveBeenCalledWith([first, []]);
    expect(rows.map((row) => [row.id, row.countedSets, row.volumeKg])).toEqual([
      ['w2', 3, 1500],
      ['w1', 0, null],
    ]);
  });
});

describe('an exercise’s charts', () => {
  it('plots the core’s values in the user’s unit, on real days, oldest first (INV-01, INV-25)', () => {
    metrics.mockReturnValue([measured({ topLoadKg: 100 * KILOGRAMS_PER_POUND }), measured({ topLoadKg: 110 * KILOGRAMS_PER_POUND })]);
    const charts = exerciseCharts([session('w1', '2026-09-12'), session('w2', '2026-09-23')], 'imperial', 'pt-BR');
    expect(charts.topLoad.map((point) => point.y)).toEqual([expect.closeTo(100, 10), expect.closeTo(110, 10)]);
    expect((charts.topLoad[1]?.x ?? 0) - (charts.topLoad[0]?.x ?? 0)).toBe(11);
    expect(charts.topLoad.map((point) => point.dayLabel)).toEqual(['12/09/2026', '23/09/2026']);
    expect(charts.topLoad.map((point) => point.key)).toEqual(['w1', 'w2']);
  });

  it('leaves a session with no e1RM as a gap, never a zero — a blank RIR is not 0 (INV-03, INV-07)', () => {
    metrics.mockReturnValue([measured({ bestE1rmKg: 120 }), measured({ bestE1rmKg: null }), measured({ bestE1rmKg: 125 })]);
    const charts = exerciseCharts(
      [session('w1', '2026-09-01'), session('w2', '2026-09-03', [set({ rir: null })]), session('w3', '2026-09-05')],
      'metric',
      'en',
    );
    expect(charts.e1rm.map((point) => point.y)).toEqual([120, null, 125]);
    expect(hasValues(charts.e1rm)).toBe(true);
  });

  it('hands the core the sets of each session exactly as read, warm-ups and all — it decides what counts (INV-04)', () => {
    metrics.mockReturnValue([measured()]);
    const sets = [set({ setType: 'warmup' }), set()];
    exerciseCharts([session('w1', '2026-09-01', sets)], 'metric', 'en');
    expect(metrics).toHaveBeenCalledWith([sets]);
  });

  it('has nothing to draw when every value is missing', () => {
    metrics.mockReturnValue([measured({ volumeKg: null })]);
    expect(hasValues(exerciseCharts([session('w1', '2026-09-01')], 'metric', 'en').volume)).toBe(false);
  });

  it('charts only what is measured in load — a hold or a carry is listed, not charted (decision 6)', () => {
    expect(isCharted('weight_reps')).toBe(true);
    expect(isCharted('reps_only')).toBe(true);
    expect(isCharted('duration')).toBe(false);
    expect(isCharted('distance_duration')).toBe(false);
  });

  it('writes a chart value to one decimal in the user’s unit', () => {
    expect(chartQuantity(83.3333, 'metric', 'pt-BR')).toEqual({ text: '83,3', amount: 83.3, unit: 'kg' });
    expect(chartQuantity(225, 'imperial', 'en').unit).toBe('lb');
  });
});

describe('a logged set, in words', () => {
  const base: PerformedSet = {
    setIndex: 1,
    setType: 'working',
    weightKg: 62.5,
    reps: 8,
    rir: 2,
    durationS: null,
    distanceM: null,
    isCompleted: true,
  };

  it('reads weight, reps and RIR in the user’s units and language', () => {
    expect(setLine(base, 'weight_reps', tOf('pt-BR'), 'metric', 'pt-BR')).toBe('62,5 kg × 8 repetições · RIR 2');
    expect(setLine({ ...base, weightKg: 100 * KILOGRAMS_PER_POUND }, 'weight_reps', tOf('en'), 'imperial', 'en')).toBe(
      '100 lb × 8 reps · RIR 2',
    );
  });

  it('says a blank RIR is not recorded — never 0 (INV-03)', () => {
    expect(setLine({ ...base, rir: null }, 'weight_reps', tOf('en'), 'metric', 'en')).toBe('62.5 kg × 8 reps · RIR not recorded');
  });

  it('gives a hold its time alone and a carry its load, distance and time, with no RIR', () => {
    const hold = { ...base, weightKg: null, reps: null, rir: null, durationS: 90 };
    expect(setLine(hold, 'duration', tOf('en'), 'metric', 'en')).toBe('1:30');
    const carry = { ...base, weightKg: 24, reps: null, rir: null, durationS: 40, distanceM: 30.48 };
    expect(setLine(carry, 'distance_duration', tOf('en'), 'imperial', 'en')).toBe('52.91 lb · 100 ft · 0:40');
  });

  it('marks a missing value rather than inventing one', () => {
    expect(setLine({ ...base, weightKg: null }, 'weight_reps', tOf('en'), 'metric', 'en')).toBe('– × 8 reps · RIR 2');
  });
});
