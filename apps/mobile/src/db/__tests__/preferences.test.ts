import { readThemePreference, writeThemePreference } from '../preferences';

// Jest hoists this above the import; a factory may only reach variables whose names start with `mock`.
const mockStore = new Map<string, string>();

jest.mock('expo-sqlite/kv-store', () => ({
  Storage: {
    getItemSync: (key: string) => mockStore.get(key) ?? null,
    setItemSync: (key: string, value: string) => mockStore.set(key, value),
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
