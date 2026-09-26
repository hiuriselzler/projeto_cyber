/**
 * The planner's rows, built purely — task 005 stage 4a.
 *
 * Only the pure half is under test: the cascades that feed the engine, and the diff that decides what a write-back
 * touches. `src/db/planner.ts` reaches SQLite and the native core, neither of which opens under Node, so that the
 * rows land — and how long a 24 × 5 block takes to — is the device's to prove, on the diagnostics screen.
 */
import type { PlanCycle, PlanSet, ProgressionRule } from '@/domain';

import {
  diffPlan,
  FALLBACK_INCREMENT_KG,
  idsNeeded,
  mesocycleSpecOf,
  resolveIncrement,
  resolveRuleId,
  ruleOfRow,
} from '../planner';

jest.mock('../client', () => ({ db: {}, sqlite: {} }));
jest.mock('@/domain', () => ({}));
jest.mock('@/crypto/identifiers', () => ({ uuidV7Batch: jest.fn() }));

const RULE: ProgressionRule = {
  strategy: 'linear_load',
  loadStepKg: 2.5,
  loadStepBp: null,
  repStep: 1,
  minReps: 6,
  maxReps: 6,
  minRir: 0,
  maxRir: 4,
  rirMode: 'per_exercise',
  rirOffsets: null,
  rirStart: null,
  rirEnd: null,
  percentWaveBp: null,
  baselineE1rmKg: null,
  failurePolicy: 'hold',
  failureLoadBp: 9000,
  rounding: 'nearest',
};

function set(setIndex: number, targetWeightKg: number, overrides: Partial<PlanSet> = {}): PlanSet {
  return {
    setIndex,
    setType: 'working',
    targetWeightKg,
    targetReps: 6,
    targetMinReps: null,
    targetMaxReps: null,
    targetRir: 3,
    wasClamped: false,
    origin: 'generated',
    isPinned: false,
    ...overrides,
  };
}

function cycle(cycleNumber: number, loads: readonly number[], overrides: Partial<PlanCycle> = {}): PlanCycle {
  return {
    cycleNumber,
    lengthDays: 7,
    startsOn: `2026-10-${String(5 + 7 * (cycleNumber - 1)).padStart(2, '0')}`,
    isDeload: false,
    status: 'projected',
    engineVersion: 1,
    lastWriteKind: 'engine',
    sessions: [
      {
        dayIndex: 1,
        orderIndex: 0,
        exercises: [
          {
            orderIndex: 0,
            exerciseId: 'squat',
            incrementKg: 2.5,
            rule: RULE,
            usesBodyweight: false,
            bodyWeightKg: null,
            sets: loads.map((load, at) => set(at, load)),
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('INV-02: the increment an exercise is prescribed in', () => {
  it('is its own, else its modality’s for the user’s unit system, else 2.5 kg or exactly 5 lb', () => {
    expect(resolveIncrement(1.25, 2.5, 'metric')).toBe(1.25);
    expect(resolveIncrement(null, 2.267962, 'imperial')).toBe(2.267962);
    expect(resolveIncrement(null, null, 'metric')).toBe(FALLBACK_INCREMENT_KG.metric);
    expect(resolveIncrement(null, null, 'imperial')).toBe(2.267962);
  });
});

describe('FR-3.6: the rule an exercise runs under', () => {
  it('is its own, else the block’s default — and null when neither, since there is no product default', () => {
    expect(resolveRuleId('own', 'default')).toBe('own');
    expect(resolveRuleId(null, 'default')).toBe('default');
    expect(resolveRuleId(null, null)).toBeNull();
  });

  it('never lets cycle_pattern through — it is v2, unimplemented rather than half-implemented', () => {
    const row = { ...RULE, strategy: 'cycle_pattern' } as unknown as Parameters<typeof ruleOfRow>[0];
    expect(() => ruleOfRow(row)).toThrow(/v2/);
  });
});

describe('the mesocycle, as the engine reads it', () => {
  const row = {
    startDate: '2026-10-05',
    numMicrocycles: 4,
    defaultMicrocycleDays: 7,
    deloadMode: 'manual',
    deloadEveryNMicrocycles: null,
    deloadFinalCycle: false,
    deloadSetBp: 5000,
    deloadLoadBp: 6000,
    deloadRirBump: 2,
  } as unknown as Parameters<typeof mesocycleSpecOf>[0];

  it('takes a manual policy’s deloads and each cycle’s own length from the cycles themselves', () => {
    const spec = mesocycleSpecOf(row, [
      { cycleNumber: 1, lengthDays: 7, isDeload: false },
      { cycleNumber: 2, lengthDays: 5, isDeload: false },
      { cycleNumber: 3, lengthDays: 7, isDeload: true },
    ]);
    expect(spec.deload).toEqual({ mode: 'manual', cycles: [3] });
    expect(spec.lengthOverrides).toEqual([{ cycleNumber: 2, lengthDays: 5 }]);
  });
});

describe('writing a plan back touches only what changed (stage 4a decision 3)', () => {
  const before = [cycle(1, [40]), cycle(2, [42.5]), cycle(3, [45])];

  it('writes nothing when nothing changed — reconciling twice leaves the rows alone, updated_at included', () => {
    const diff = diffPlan(before, before);
    expect(diff.cycles.updated).toHaveLength(0);
    expect(diff.sets.updated).toHaveLength(0);
    expect(idsNeeded(diff)).toBe(0);
    expect(diff.sets.archived).toHaveLength(0);
  });

  it('updates exactly the set that moved, and the cycle whose stamp moved', () => {
    const after = [before[0]!, cycle(2, [45], { lastWriteKind: 'engine' }), cycle(3, [45])];
    const diff = diffPlan(before, after);
    expect(diff.sets.updated.map((it) => it.key)).toEqual(['2|1|0|0|0']);
    expect(diff.cycles.updated).toHaveLength(0);
    const restamped = diffPlan(before, [before[0]!, before[1]!, cycle(3, [45], { status: 'in_progress' })]);
    expect(restamped.cycles.updated.map((it) => it.cycleNumber)).toEqual([3]);
  });

  it('inserts a new cycle whole, and archives what the plan no longer holds (INV-11)', () => {
    const extended = diffPlan(before, [...before, cycle(4, [47.5])]);
    expect(extended.cycles.inserted.map((it) => it.cycleNumber)).toEqual([4]);
    expect(idsNeeded(extended)).toBe(4);

    const shortened = diffPlan(before, before.slice(0, 2));
    expect(shortened.cycles.archived).toEqual([3]);
    expect(shortened.sets.archived).toEqual(['3|1|0|0|0']);
  });

  it('inserts a set an anchor added, and archives one it no longer prescribes', () => {
    const diff = diffPlan([cycle(2, [42.5, 42.5])], [cycle(2, [42.5, 42.5, 42.5])]);
    expect(diff.sets.inserted.map((it) => `${it.exerciseKey}|${it.set.setIndex}`)).toEqual(['2|1|0|0|2']);
    const deloaded = diffPlan([cycle(2, [42.5, 42.5])], [cycle(2, [25])]);
    expect(deloaded.sets.archived).toEqual(['2|1|0|0|1']);
    expect(deloaded.sets.updated.map((it) => it.key)).toEqual(['2|1|0|0|0']);
  });
});
