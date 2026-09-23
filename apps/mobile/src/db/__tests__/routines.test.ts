/**
 * Routines — task 004 stage 5a. The pure half: the rows, the superset runs, the reorder plan, and above all the
 * pre-fill rule a routine start follows (task 004 § Stages, decision 3).
 *
 * The writes reach `expo-sqlite`, which cannot open under Node; that they land, and that the two-pass reorder really
 * clears SQLite's row-by-row unique check, is a device check.
 */
import type { LiveSet } from '../strength';
import {
  idsNeededToStart,
  moveItem,
  NO_TARGETS,
  normaliseFolder,
  normaliseSupersets,
  prefillSets,
  reorderPlan,
  routineExerciseRow,
  routineNameProblem,
  routineRow,
  startFromRoutineRows,
  targetProblem,
  toggleSupersetWithNext,
  tombstoneIndex,
  type Routine,
  type RoutineExercise,
  type StartSource,
} from '../routines';

jest.mock('../client', () => ({ db: {}, sqlite: {} }));

const USER = 'user-1';
const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);

function routineExercise(overrides: Partial<RoutineExercise> = {}): RoutineExercise {
  return {
    id: 're1',
    exerciseId: 'e-squat',
    orderIndex: 1,
    supersetGroup: null,
    ...NO_TARGETS,
    notes: null,
    ...overrides,
  };
}

function done(setIndex: number, overrides: Partial<LiveSet> = {}): [number, LiveSet] {
  return [
    setIndex,
    {
      id: `old-${String(setIndex)}`,
      setIndex,
      setType: 'working',
      weightKg: 40,
      reps: 6,
      rir: 2,
      isCompleted: true,
      completedAt: NOW - 86_400_000,
      ...overrides,
    },
  ];
}

describe('a routine', () => {
  it('keeps its name exactly as typed, trimmed of stray whitespace (INV-27)', () => {
    const row = routineRow({ id: 'r1', userId: USER, name: '  Treino A  ', folder: null, orderIndex: 1, notes: null, now: NOW });
    expect(row.name).toBe('Treino A');
  });

  it('refuses a blank name, and nothing else — two routines may share one', () => {
    expect(routineNameProblem('   ')).toBe('empty');
    expect(routineNameProblem('Treino A')).toBeNull();
  });

  it('stores a blank folder as no folder, never as a folder named ""', () => {
    expect(normaliseFolder('   ')).toBeNull();
    expect(normaliseFolder(null)).toBeNull();
    expect(normaliseFolder(' Push/Pull ')).toBe('Push/Pull');
  });

  it('starts an added exercise with no targets at all — no invented set count or rest (decision 1)', () => {
    const row = routineExerciseRow({
      id: 're1',
      userId: USER,
      routineId: 'r1',
      exerciseId: 'e1',
      orderIndex: 1,
      supersetGroup: null,
      targets: NO_TARGETS,
      notes: null,
      now: NOW,
    });
    expect(row).toMatchObject({ targetSets: null, targetMinReps: null, targetMaxReps: null, targetRir: null, restSeconds: null });
  });
});

describe('targets', () => {
  it('accept nothing set at all', () => {
    expect(targetProblem(NO_TARGETS)).toBeNull();
  });

  it('refuse a rep range upside down', () => {
    expect(targetProblem({ ...NO_TARGETS, targetMinReps: 8, targetMaxReps: 6 })).toBe('rep_range');
    expect(targetProblem({ ...NO_TARGETS, targetMinReps: 6, targetMaxReps: 6 })).toBeNull();
  });

  it('hold RIR to 0..10, the same range the schema does (INV-03)', () => {
    expect(targetProblem({ ...NO_TARGETS, targetRir: 0 })).toBeNull();
    expect(targetProblem({ ...NO_TARGETS, targetRir: 10 })).toBeNull();
    expect(targetProblem({ ...NO_TARGETS, targetRir: 11 })).toBe('rir');
  });

  it('refuse a negative rest, or one a smallint cannot hold', () => {
    expect(targetProblem({ ...NO_TARGETS, restSeconds: -30 })).toBe('rest');
    expect(targetProblem({ ...NO_TARGETS, restSeconds: 40_000 })).toBe('rest');
    expect(targetProblem({ ...NO_TARGETS, restSeconds: 0 })).toBeNull();
  });

  it('refuse zero sets and fractional counts', () => {
    expect(targetProblem({ ...NO_TARGETS, targetSets: 0 })).toBe('sets');
    expect(targetProblem({ ...NO_TARGETS, targetSets: 2.5 })).toBe('sets');
  });
});

describe('superset groups (FR-2.6)', () => {
  it('are runs of neighbours, numbered from the top, and a run of one is no superset', () => {
    expect(normaliseSupersets([7, 7, null, 3, 9, 9, 9])).toEqual([1, 1, null, null, 2, 2, 2]);
  });

  it('split two runs that happen to share a number', () => {
    expect(normaliseSupersets([4, 4, null, 4, 4])).toEqual([1, 1, null, 2, 2]);
  });

  it('link an exercise to the one below it', () => {
    expect(toggleSupersetWithNext([null, null, null], 0)).toEqual([1, 1, null]);
  });

  it('grow a pair into a giant set when the third is linked', () => {
    expect(toggleSupersetWithNext([1, 1, null], 1)).toEqual([1, 1, 1]);
  });

  it('merge two neighbouring groups into one', () => {
    expect(toggleSupersetWithNext([1, 1, 2, 2], 1)).toEqual([1, 1, 1, 1]);
  });

  it('cut a giant set in the middle into a pair and a single, never leaving the third attached', () => {
    expect(toggleSupersetWithNext([1, 1, 1], 0)).toEqual([null, 1, 1]);
    expect(toggleSupersetWithNext([1, 1, 1], 1)).toEqual([1, 1, null]);
  });

  it('do nothing past the last exercise', () => {
    expect(toggleSupersetWithNext([null, null], 1)).toEqual([null, null]);
  });
});

describe('reordering', () => {
  it('moves one item and keeps the rest in their order', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('parks every live row above anything in use, so the second pass never meets a neighbour', () => {
    // Live rows at 1..3, a tombstone at -1: SQLite checks the unique index row by row, so writing 1..3 in place would
    // collide halfway through.
    const plan = reorderPlan(['c', 'a', 'b'], [1, 2, 3, -1]);
    expect(plan.park.map((row) => row.orderIndex)).toEqual([4, 5, 6]);
    expect(plan.place).toEqual([
      { id: 'c', orderIndex: 1 },
      { id: 'a', orderIndex: 2 },
      { id: 'b', orderIndex: 3 },
    ]);
  });

  it('never parks a row on an index any row holds, or places one on a tombstone', () => {
    const occupied = [1, 2, 3, 9, -1, -2];
    const plan = reorderPlan(['x', 'y', 'z'], occupied);
    for (const row of plan.park) expect(occupied).not.toContain(row.orderIndex);
    for (const row of plan.place) expect(row.orderIndex).toBeGreaterThan(0);
  });

  it('moves a removed row below everything, clear of the 1..n live rows use', () => {
    expect(tombstoneIndex([1, 2, 3])).toBe(-1);
    expect(tombstoneIndex([1, 2, -1, -4])).toBe(-5);
    expect(tombstoneIndex([])).toBe(-1);
  });
});

describe('what a routine start pre-fills (FR-2.7, decision 3)', () => {
  it('never writes a RIR, even when last time had one and the routine sets a target (INV-03)', () => {
    const sets = prefillSets({
      exercise: routineExercise({ targetSets: 3, targetRir: 2 }),
      previous: new Map([done(1, { rir: 3 }), done(2, { rir: 1 })]),
    });
    for (const set of sets) expect(set).not.toHaveProperty('rir');
  });

  it('takes last time’s weight and reps at the same set index', () => {
    const sets = prefillSets({
      exercise: routineExercise({ targetSets: 2 }),
      previous: new Map([done(1, { weightKg: 60, reps: 8 }), done(2, { weightKg: 62.5, reps: 6 })]),
    });
    expect(sets).toEqual([
      { setIndex: 1, setType: 'working', weightKg: 60, reps: 8 },
      { setIndex: 2, setType: 'working', weightKg: 62.5, reps: 6 },
    ]);
  });

  it('falls back to the nearest earlier set — a fourth set after a pyramid starts from the third', () => {
    const sets = prefillSets({
      exercise: routineExercise({ targetSets: 4 }),
      previous: new Map([done(1, { weightKg: 40 }), done(2, { weightKg: 42.5 }), done(3, { weightKg: 45 })]),
    });
    expect(sets.map((set) => set.weightKg)).toEqual([40, 42.5, 45, 45]);
  });

  it('takes the type only from the same index, so a fallback never turns a new set into a warm-up', () => {
    const sets = prefillSets({
      exercise: routineExercise({ targetSets: 3 }),
      previous: new Map([done(1, { setType: 'warmup', weightKg: 20 }), done(2, { weightKg: 60 })]),
    });
    expect(sets.map((set) => set.setType)).toEqual(['warmup', 'working', 'working']);
  });

  it('uses the routine’s minimum reps, and no weight, when there is no last time at all', () => {
    const sets = prefillSets({ exercise: routineExercise({ targetSets: 2, targetMinReps: 6, targetMaxReps: 8 }), previous: new Map() });
    expect(sets).toEqual([
      { setIndex: 1, setType: 'working', weightKg: null, reps: 6 },
      { setIndex: 2, setType: 'working', weightKg: null, reps: 6 },
    ]);
  });

  it('counts sets from the routine, else from last time, else one', () => {
    expect(prefillSets({ exercise: routineExercise({ targetSets: 5 }), previous: new Map([done(1)]) })).toHaveLength(5);
    expect(prefillSets({ exercise: routineExercise(), previous: new Map([done(1), done(2), done(3)]) })).toHaveLength(3);
    expect(prefillSets({ exercise: routineExercise(), previous: new Map() })).toHaveLength(1);
  });

  it('leaves a gap in last time as it was — a set missing there is filled from the one before it', () => {
    // Set 2 was removed last time, so its index is simply absent.
    const sets = prefillSets({
      exercise: routineExercise({ targetSets: 3 }),
      previous: new Map([done(1, { weightKg: 50 }), done(3, { weightKg: 55 })]),
    });
    expect(sets.map((set) => set.weightKg)).toEqual([50, 50, 55]);
  });
});

describe('the rows a routine start writes', () => {
  const routine: Routine = {
    id: 'r1',
    name: 'Treino A',
    notes: null,
    folder: null,
    exercises: [],
  };
  const sources: StartSource[] = [
    {
      exercise: routineExercise({ id: 're1', exerciseId: 'e-squat', supersetGroup: null, targetSets: 2, restSeconds: 180, targetMinReps: 5, targetMaxReps: 8, targetRir: 2 }),
      previous: new Map([done(1, { weightKg: 100, reps: 5 })]),
    },
    {
      exercise: routineExercise({ id: 're2', exerciseId: 'e-row', supersetGroup: 1, targetSets: 1 }),
      previous: new Map(),
    },
  ];
  const ids = Array.from({ length: idsNeededToStart(sources) }, (_, at) => `id-${String(at)}`);
  const rows = startFromRoutineRows({ userId: USER, routine, sources, ids, now: NOW, tz: 'America/Sao_Paulo' });

  it('needs exactly one id per row it writes', () => {
    expect(ids).toHaveLength(1 + rows.exerciseRows.length + rows.setRows.length);
    expect(new Set([rows.workout.id, ...rows.exerciseRows.map((row) => row.id), ...rows.setRows.map((row) => row.id)]).size).toBe(ids.length);
  });

  it('is a routine workout, titled with the routine’s name exactly as typed, and open', () => {
    expect(rows.workout).toMatchObject({ source: 'routine', routineId: 'r1', title: 'Treino A', endedAt: null });
  });

  it('copies the targets and the rest onto the session, so a later routine edit cannot move a running timer', () => {
    expect(rows.exerciseRows[0]).toMatchObject({ restSeconds: 180, targetMinReps: 5, targetMaxReps: 8, targetRir: 2, orderIndex: 1 });
    expect(rows.exerciseRows[1]).toMatchObject({ supersetGroup: 1, restSeconds: null, orderIndex: 2 });
  });

  it('pre-fills weight and reps into incomplete sets, and leaves every RIR null (INV-03)', () => {
    expect(rows.setRows.map((row) => [row.weightKg, row.reps, row.rir, row.isCompleted])).toEqual([
      [100, 5, null, false],
      [100, 5, null, false],
      [null, null, null, false],
    ]);
  });

  it('refuses to run short of ids rather than writing a row with none', () => {
    expect(() => startFromRoutineRows({ userId: USER, routine, sources, ids: ids.slice(0, 2), now: NOW, tz: 'UTC' })).toThrow(
      /not enough ids/,
    );
  });
});
