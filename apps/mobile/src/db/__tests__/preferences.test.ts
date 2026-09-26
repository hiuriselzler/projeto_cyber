import {
  clearPastWorkoutEnd,
  readPastWorkoutEnd,
  readSkippedRest,
  readThemePreference,
  writePastWorkoutEnd,
  writeSkippedRest,
  writeThemePreference,
} from '../preferences';

// Jest hoists this above the import; a factory may only reach variables whose names start with `mock`.
const mockStore = new Map<string, string>();

jest.mock('expo-sqlite/kv-store', () => ({
  Storage: {
    getItemSync: (key: string) => mockStore.get(key) ?? null,
    setItemSync: (key: string, value: string) => mockStore.set(key, value),
    removeItemSync: (key: string) => mockStore.delete(key),
  },
}));

describe('the theme override, kept on the device (07 §3)', () => {
  beforeEach(() => mockStore.clear());

  it('follows the system until the user chooses', () => {
    expect(readThemePreference()).toBe('system');
  });

  it('reads back what was chosen', () => {
    writeThemePreference('light');
    expect(readThemePreference()).toBe('light');
  });

  it('falls back to the system when the stored value is not one this build knows', () => {
    mockStore.set('preference.theme', 'sepia');
    expect(readThemePreference()).toBe('system');
  });
});

describe('a skipped rest, kept on the device (task 004 stage 5b)', () => {
  beforeEach(() => mockStore.clear());

  it('is nothing until a rest is skipped', () => {
    expect(readSkippedRest()).toBeNull();
  });

  it('remembers which set’s rest was skipped, so a relaunch does not bring it back', () => {
    writeSkippedRest('set-7');
    expect(readSkippedRest()).toBe('set-7');
  });
});

describe('a past workout’s chosen end, kept on the device while it is open (task 004 stage 6)', () => {
  beforeEach(() => mockStore.clear());

  it('is nothing for a workout happening now', () => {
    expect(readPastWorkoutEnd('w1')).toBeNull();
  });

  it('reads back for the workout it was written for, and for no other', () => {
    writePastWorkoutEnd('w1', 1_700_000_000_000);
    expect(readPastWorkoutEnd('w1')).toBe(1_700_000_000_000);
    expect(readPastWorkoutEnd('w2')).toBeNull();
  });

  it('is forgotten once the workout is finished', () => {
    writePastWorkoutEnd('w1', 1_700_000_000_000);
    clearPastWorkoutEnd();
    expect(readPastWorkoutEnd('w1')).toBeNull();
  });

  it('ignores a record it cannot read rather than inventing an end', () => {
    mockStore.set('workout.past_end', 'w1|yesterday');
    expect(readPastWorkoutEnd('w1')).toBeNull();
  });
});
