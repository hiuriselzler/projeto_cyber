/**
 * The app config's colours and fonts come from the token file (INV-23): app.json cannot import it, so this holds them
 * together.
 */
import app from '../app.json';
import { colors, fontFamilies } from '../src/ui/tokens';

type PluginEntry = string | [string, Record<string, unknown>];

function pluginOptions(name: string): Record<string, unknown> {
  const entry = (app.expo.plugins as PluginEntry[]).find((plugin) => Array.isArray(plugin) && plugin[0] === name);
  if (!Array.isArray(entry)) {
    throw new Error(`${name} has no options in app.json`);
  }
  return entry[1];
}

describe('app.json', () => {
  it('grounds the adaptive icon in the dark background token', () => {
    expect(app.expo.android.adaptiveIcon.backgroundColor).toBe(colors.dark.bgAbyss);
  });

  it('grounds the splash in each theme’s background token', () => {
    const splash = pluginOptions('expo-splash-screen') as { backgroundColor: string; dark: { backgroundColor: string } };

    expect(splash.backgroundColor).toBe(colors.light.bgAbyss);
    expect(splash.dark.backgroundColor).toBe(colors.dark.bgAbyss);
  });

  it('bundles a font file for every family the type tokens name, and no other', () => {
    const { fonts } = pluginOptions('expo-font') as { fonts: string[] };
    const bundled = fonts.map((file) => file.replace(/^.*\//, '').replace(/\.ttf$/, '')).sort();

    expect(bundled).toEqual(Object.values(fontFamilies).sort());
  });
});
