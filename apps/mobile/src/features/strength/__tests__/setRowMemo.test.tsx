/**
 * A ✓ re-renders the row it ticked, not the whole workout — task 004's closing pass, 2026-09-25.
 *
 * On the phone every ✓ re-rendered all twenty set rows of a five-exercise session, ~83 % of the tap's render: the
 * re-read hands back every set as a new object (INV-09), and a row inside a `.map()` has no cache of its own. The
 * rows are now memoized on their values. This replaces the exercise with fresh objects exactly as a re-read does and
 * counts which rows `SetRow` actually draws.
 */
import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { MATRIX, renderUi } from '../../../../test/render';
import type { LiveExercise, LiveSet } from '@/db/strength';
import type { SetRowField, SetRowProps } from '@/ui';
import { ExerciseBlock } from '../ExerciseBlock';

const mockDrawn: number[] = [];

jest.mock('@/ui', () => {
  const actual = jest.requireActual<typeof import('@/ui')>('@/ui');
  return {
    ...actual,
    SetRow: (props: SetRowProps) => {
      mockDrawn.push(props.setNumber);
      return actual.SetRow(props);
    },
  };
});

function set(setIndex: number, overrides: Partial<LiveSet> = {}): LiveSet {
  return {
    id: `s${setIndex}`,
    setIndex,
    setType: 'working',
    weightKg: 60,
    reps: 8,
    rir: null,
    durationS: null,
    distanceM: null,
    isCompleted: false,
    completedAt: null,
    ...overrides,
  };
}

/** A fresh read of the same exercise: every object new, every value as SQLite holds it. */
function read(completed: readonly number[]): LiveExercise {
  return {
    id: 'we1',
    exerciseId: 'e-bench',
    orderIndex: 1,
    supersetGroup: null,
    tracking: 'weight_reps',
    notes: null,
    restSeconds: 90,
    targetMinReps: null,
    targetMaxReps: null,
    targetRir: null,
    sets: [1, 2, 3, 4].map((index) => set(index, { isCompleted: completed.includes(index) })),
  };
}

// Stable, as the live screen's are (`useStableHandler`); the memo holds only if these do.
const PREVIOUS = new Map<number, LiveSet>();
function noop() {
  // Reported upwards; the harness does not care.
}

/** The block as the live screen drives it: a ✓ is a re-read, and the keypad moves `editing`. */
function Harness() {
  const [completed, setCompleted] = useState<readonly number[]>([]);
  const [editing, setEditing] = useState<{ setLogId: string; field: SetRowField } | null>(null);
  return (
    <>
      <Pressable testID="tick-2" onPress={() => setCompleted([2])} />
      <Pressable testID="reread" onPress={() => setCompleted((current) => [...current])} />
      <Pressable testID="edit-1" onPress={() => setEditing({ setLogId: 's1', field: 'weight' })} />
      <Pressable testID="edit-3" onPress={() => setEditing({ setLogId: 's3', field: 'weight' })} />
      <ExerciseBlock
        exercise={read(completed)}
        catalog={null}
        previous={PREVIOUS}
        editing={editing}
        onEdit={noop}
        onToggleComplete={noop}
        onAddSet={noop}
        onRowLayout={noop}
      />
    </>
  );
}

describe.each(MATRIX)('$locale, $unitSystem, $preference', (setting) => {
  beforeEach(() => {
    mockDrawn.length = 0;
  });

  it('draws only the ticked row when a ✓ re-reads the whole exercise', async () => {
    await renderUi(<Harness />, setting);
    expect(mockDrawn.sort()).toEqual([1, 2, 3, 4]);

    mockDrawn.length = 0;
    await fireEvent.press(screen.getByTestId('tick-2'));
    expect(mockDrawn).toEqual([2]);
  });

  it('draws nothing when a re-read finds nothing changed', async () => {
    await renderUi(<Harness />, setting);
    mockDrawn.length = 0;
    await fireEvent.press(screen.getByTestId('reread'));
    expect(mockDrawn).toEqual([]);
  });

  it('draws the row the keypad leaves and the row it lands on, and no other', async () => {
    await renderUi(<Harness />, setting);
    await fireEvent.press(screen.getByTestId('edit-1'));
    mockDrawn.length = 0;
    await fireEvent.press(screen.getByTestId('edit-3'));
    expect(mockDrawn.sort()).toEqual([1, 3]);
  });
});
