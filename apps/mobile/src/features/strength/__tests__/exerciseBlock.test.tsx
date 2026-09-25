/**
 * One exercise of a live workout, in both languages, both unit systems and both themes — task 004 stage 3.
 *
 * Props only: `ExerciseBlock` takes its catalog row and its previous performance from its caller, so this suite
 * reaches no database. What the rows look like once SQLite has them is `src/db/__tests__/strength.test.ts`, and that
 * they land at all is a device check.
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { MATRIX, renderUi } from '../../../../test/render';
import type { CatalogExercise } from '@/db/catalog';
import type { LiveExercise, LiveSet } from '@/db/strength';
import { ExerciseBlock } from '../ExerciseBlock';

/** A catalog row with everything but the part under test held still. */
export function catalogExercise(overrides: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
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
    ...overrides,
  };
}

const GLOBAL_BENCH = catalogExercise({ loadIncrementKg: 2.5 });

/** What the user wrote, in Portuguese, on an account whose UI may be in either language (INV-27). */
const USER_WRITTEN = catalogExercise({
  id: 'e-mine',
  nameKey: null,
  name: 'Supino inclinado do João',
  ownerUserId: 'u1',
});

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

function exercise(sets: readonly LiveSet[]): LiveExercise {
  return { id: 'we1', exerciseId: 'e-bench', orderIndex: 1, supersetGroup: null, tracking: 'weight_reps', notes: null, restSeconds: null, targetMinReps: null, targetMaxReps: null, targetRir: null, sets };
}

function noop() {
  // The block under test reports upwards; most tests do not care what the caller does with it.
}

describe.each(MATRIX)('$locale, $unitSystem, $preference', (setting) => {
  it('names a global exercise in the reading language, through its key (INV-27)', async () => {
    await renderUi(
      <ExerciseBlock
        exercise={exercise([set()])}
        catalog={GLOBAL_BENCH}
        previous={new Map()}
        editing={null}
        onEdit={noop}
        onToggleComplete={noop}
        onAddSet={noop}
        onRowLayout={noop}
      />,
      setting,
    );

    const expected = setting.locale === 'pt-BR' ? 'Supino reto com barra' : 'Barbell Bench Press';
    expect(screen.getByText(expected)).toBeOnTheScreen();
  });

  // Task 004: "A custom exercise named in Portuguese appears exactly as typed in an English UI."
  it('shows a user’s own exercise exactly as typed, in either language', async () => {
    await renderUi(
      <ExerciseBlock
        exercise={exercise([set()])}
        catalog={USER_WRITTEN}
        previous={new Map()}
        editing={null}
        onEdit={noop}
        onToggleComplete={noop}
        onAddSet={noop}
        onRowLayout={noop}
      />,
      setting,
    );

    expect(screen.getByText('Supino inclinado do João')).toBeOnTheScreen();
  });

  it('puts last time’s performance behind the row it belongs to (FR-2.12)', async () => {
    const previous = new Map<number, LiveSet>([[1, set({ id: 'old', weightKg: 40, reps: 6, rir: 2 })]]);
    await renderUi(
      <ExerciseBlock
        exercise={exercise([set()])}
        catalog={GLOBAL_BENCH}
        previous={previous}
        editing={null}
        onEdit={noop}
        onToggleComplete={noop}
        onAddSet={noop}
        onRowLayout={noop}
      />,
      setting,
    );

    // 40 kg for a metric reader, 88.18 lb for an imperial one — the row converts, the stored value does not (INV-01).
    const weight = setting.unitSystem === 'imperial' ? '88' : '40';
    expect(screen.getByText(new RegExp(weight))).toBeOnTheScreen();
  });

  it('reports the tick with the completion the set does not yet have', async () => {
    const onToggleComplete = jest.fn();
    await renderUi(
      <ExerciseBlock
        exercise={exercise([set({ isCompleted: false })])}
        catalog={GLOBAL_BENCH}
        previous={new Map()}
        editing={null}
        onEdit={noop}
        onToggleComplete={onToggleComplete}
        onAddSet={noop}
        onRowLayout={noop}
      />,
      setting,
    );

    await fireEvent.press(screen.getByTestId('set-row-complete'));
    expect(onToggleComplete).toHaveBeenCalledWith('s1', true);
  });

  it('asks for the field the user tapped, so the right editor opens', async () => {
    const onEdit = jest.fn();
    await renderUi(
      <ExerciseBlock
        exercise={exercise([set()])}
        catalog={GLOBAL_BENCH}
        previous={new Map()}
        editing={null}
        onEdit={onEdit}
        onToggleComplete={noop}
        onAddSet={noop}
        onRowLayout={noop}
      />,
      setting,
    );

    await fireEvent.press(screen.getByTestId('set-row-rir'));
    expect(onEdit).toHaveBeenCalledWith('s1', 'rir');
  });
});
