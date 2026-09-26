/**
 * Routines on screen — task 004 stage 5a. The pure helpers the screens are built on, and the two components whose
 * behaviour is a decision: the targets sheet (blank is "not set", never 0) and the exercise block showing what a
 * routine carried onto a session (the target RIR shown, never logged — INV-03).
 *
 * `@/db/client` is mocked because `targetsDraft` reaches `@/db/routines` for its validator, and `expo-sqlite` cannot
 * open under Node. Nothing here writes; the writes are a device check.
 */
import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { MATRIX, renderUi } from '../../../../test/render';
import type { CatalogExercise } from '@/db/catalog';
import type { RoutineSummary, RoutineTargets } from '@/db/routines';
import type { LiveExercise, LiveSet } from '@/db/strength';
import { useT } from '@/ui';

import { ExerciseBlock } from '../ExerciseBlock';
import { groupByFolder } from '../routineList';
import { TargetsSheet } from '../TargetsSheet';
import { draftFromTargets, restChoices, targetsFromDraft } from '../targetsDraft';
import { targetSummary, type TargetsLike } from '../targetText';

jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));

const NONE: RoutineTargets = { targetSets: null, targetMinReps: null, targetMaxReps: null, targetRir: null, restSeconds: null };

function summary(overrides: Partial<RoutineSummary>): RoutineSummary {
  return { id: 'r', name: 'Treino', folder: null, orderIndex: 1, exerciseCount: 0, archivedAt: null, ...overrides };
}

describe('folders (FR-2.5)', () => {
  it('put unfiled routines first, then each folder in the order it first appears, routines kept in order', () => {
    const groups = groupByFolder([
      summary({ id: 'a', folder: 'Push' }),
      summary({ id: 'b', folder: null }),
      summary({ id: 'c', folder: 'Pull' }),
      summary({ id: 'd', folder: 'Push' }),
    ]);
    expect(groups.map((group) => [group.folder, group.routines.map((routine) => routine.id)])).toEqual([
      [null, ['b']],
      ['Push', ['a', 'd']],
      ['Pull', ['c']],
    ]);
  });

  it('compare folder names exactly as typed — "Push" and "push" are the user’s two folders (INV-27)', () => {
    expect(groupByFolder([summary({ folder: 'Push' }), summary({ folder: 'push' })])).toHaveLength(2);
  });

  it('invent no heading for a user with no folders at all', () => {
    expect(groupByFolder([summary({ id: 'a' })])).toEqual([{ folder: null, routines: [summary({ id: 'a' })] }]);
  });
});

describe('the targets draft', () => {
  it('stores a blank field as null, never 0', () => {
    expect(targetsFromDraft(draftFromTargets(NONE))).toEqual({ targets: NONE });
  });

  it('round-trips every target the sheet can hold', () => {
    const targets: RoutineTargets = { targetSets: 3, targetMinReps: 6, targetMaxReps: 8, targetRir: 2, restSeconds: 150 };
    expect(targetsFromDraft(draftFromTargets(targets))).toEqual({ targets });
  });

  it('reports a count that is not a whole number on its own field', () => {
    expect(targetsFromDraft({ ...draftFromTargets(NONE), sets: '3,5' })).toEqual({ problem: 'sets' });
    expect(targetsFromDraft({ ...draftFromTargets(NONE), minReps: 'x' })).toEqual({ problem: 'reps' });
  });

  it('refuses a rep range upside down', () => {
    expect(targetsFromDraft({ ...draftFromTargets(NONE), minReps: '8', maxReps: '6' })).toEqual({ problem: 'rep_range' });
  });

  it('offers a stored rest that is none of the standard choices, in its place, so it is never silently lost', () => {
    expect(restChoices(150)).toEqual([30, 60, 90, 120, 150, 180, 300]);
    expect(restChoices(null)).toEqual([30, 60, 90, 120, 180, 300]);
  });
});

/** Renders `targetSummary` through the real catalogs and the real `t`, plurals and all. */
function Summary({ targets }: { readonly targets: TargetsLike }) {
  const t = useT();
  return <Text testID="summary">{targetSummary(targets, (key, options) => t(key, options)) ?? ''}</Text>;
}

const SUMMARY = {
  en: { full: '3 sets · 6–8 reps · RIR 2 · rest 2:00', single: '1 set · 5 reps' },
  'pt-BR': { full: '3 séries · 6–8 repetições · RIR 2 · descanso 2:00', single: '1 série · 5 repetições' },
} as const;

function set(overrides: Partial<LiveSet> = {}): LiveSet {
  return {
    id: 's1',
    setIndex: 1,
    setType: 'working',
    weightKg: null,
    reps: null,
    rir: null,
    durationS: null,
    distanceM: null,
    isCompleted: false,
    completedAt: null,
    ...overrides,
  };
}

function liveExercise(overrides: Partial<LiveExercise> = {}): LiveExercise {
  return {
    id: 'we1',
    exerciseId: 'e-bench',
    orderIndex: 1,
    supersetGroup: null,
    tracking: 'weight_reps',
    notes: null,
    restSeconds: null,
    targetMinReps: null,
    targetMaxReps: null,
    targetRir: null,
    sets: [set()],
    ...overrides,
  };
}

const BENCH: CatalogExercise = {
  id: 'e-bench',
  nameKey: 'exercise.barbell_bench_press',
  name: null,
  ownerUserId: null,
  forkedFromId: null,
  modality: 'barbell',
  primaryMuscleId: 1,
  tracking: 'weight_reps',
  isUnilateral: false,
  usesBodyweight: false,
  loadIncrementKg: null,
  notes: null,
  archivedAt: null,
};

/** Whatever the screen resolved the exercise's name to; the sheet only displays it. */
const SHEET_TITLE = 'Supino reto';

function noop() {
  // Reported upwards; these tests do not care what the caller does with it.
}

describe.each(MATRIX)('$locale, $unitSystem, $preference', (setting) => {
  const words = SUMMARY[setting.locale];

  it('reads targets as one line, in the language’s own words and plurals', async () => {
    await renderUi(
      <Summary targets={{ targetSets: 3, targetMinReps: 6, targetMaxReps: 8, targetRir: 2, restSeconds: 120 }} />,
      setting,
    );
    expect(screen.getByTestId('summary')).toHaveTextContent(words.full);
  });

  it('says a single rep count once, and leaves out what is not set rather than drawing a dash', async () => {
    await renderUi(<Summary targets={{ targetSets: 1, targetMinReps: 5, targetMaxReps: 5, targetRir: null, restSeconds: null }} />, setting);
    expect(screen.getByTestId('summary')).toHaveTextContent(words.single);
  });

  it('shows a session’s targets beside its sets, and writes none of them into a set (INV-03)', async () => {
    await renderUi(
      <ExerciseBlock
        exercise={liveExercise({ targetMinReps: 6, targetMaxReps: 8, targetRir: 2, restSeconds: 120 })}
        catalog={BENCH}
        previous={new Map()}
        editing={null}
        onEdit={noop}
        onToggleComplete={noop}
        onAddSet={noop}
        onRowLayout={noop}
      />,
      setting,
    );
    const target = setting.locale === 'pt-BR' ? /Meta: 6–8 repetições · RIR 2/ : /Target: 6–8 reps · RIR 2/;
    expect(screen.getByText(target)).toBeOnTheScreen();
    // The row itself still reads "not recorded": a target is not a log.
    const blank = setting.locale === 'pt-BR' ? /RIR não registrado/ : /RIR not recorded/;
    expect(screen.getByLabelText(blank)).toBeOnTheScreen();
  });

  it('names a superset in words, never by colour alone (INV-24)', async () => {
    await renderUi(
      <ExerciseBlock
        exercise={liveExercise({ supersetGroup: 1 })}
        catalog={BENCH}
        previous={new Map()}
        editing={null}
        onEdit={noop}
        onToggleComplete={noop}
        onAddSet={noop}
        onRowLayout={noop}
      />,
      setting,
    );
    expect(screen.getByText('Superset')).toBeOnTheScreen();
  });

  it('shows no target line at all for an exercise added by hand', async () => {
    await renderUi(
      <ExerciseBlock
        exercise={liveExercise()}
        catalog={BENCH}
        previous={new Map()}
        editing={null}
        onEdit={noop}
        onToggleComplete={noop}
        onAddSet={noop}
        onRowLayout={noop}
      />,
      setting,
    );
    expect(screen.queryByText(/Target:|Meta:/)).toBeNull();
  });

  it('saves blank fields as null, and a chosen rest and RIR as chosen', async () => {
    const onSave = jest.fn();
    await renderUi(<TargetsSheet title={SHEET_TITLE} targets={NONE} onClose={noop} onSave={onSave} />, setting);

    await fireEvent.press(screen.getByText('2:00'));
    await fireEvent.press(screen.getByLabelText('RIR 2'));
    await fireEvent.press(screen.getByText(setting.locale === 'pt-BR' ? 'Salvar' : 'Save'));

    expect(onSave).toHaveBeenCalledWith({ ...NONE, restSeconds: 120, targetRir: 2 });
  });

  it('refuses to save a rep range upside down, and says why on the field', async () => {
    const onSave = jest.fn();
    await renderUi(
      <TargetsSheet title={SHEET_TITLE} targets={{ ...NONE, targetMinReps: 8, targetMaxReps: 6 }} onClose={noop} onSave={onSave} />,
      setting,
    );
    await fireEvent.press(screen.getByText(setting.locale === 'pt-BR' ? 'Salvar' : 'Save'));

    expect(onSave).not.toHaveBeenCalled();
    const message = setting.locale === 'pt-BR' ? 'O mínimo não pode passar do máximo.' : 'The minimum cannot be above the maximum.';
    expect(screen.getByText(message)).toBeOnTheScreen();
  });

  it('offers no rep range and no RIR for a time or distance exercise, and keeps none on save (5c decision 5)', async () => {
    const onSave = jest.fn();
    await renderUi(
      <TargetsSheet
        title={SHEET_TITLE}
        targets={{ ...NONE, targetSets: 3, targetMinReps: 8, targetMaxReps: 10, targetRir: 2 }}
        countsReps={false}
        onClose={noop}
        onSave={onSave}
      />,
      setting,
    );
    expect(screen.queryByText(setting.locale === 'pt-BR' ? 'Repetições mínimas' : 'Minimum reps')).toBeNull();
    expect(screen.queryByText(setting.locale === 'pt-BR' ? 'RIR alvo' : 'Target RIR')).toBeNull();

    await fireEvent.press(screen.getByText(setting.locale === 'pt-BR' ? 'Salvar' : 'Save'));
    expect(onSave).toHaveBeenCalledWith({ ...NONE, targetSets: 3 });
  });
});
