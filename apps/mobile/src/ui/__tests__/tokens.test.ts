/**
 * The palette against its own rule (07 §3, INV-24, ADR-014): every token against every background of its theme.
 * A token change that breaks a floor fails here, before anyone has to look at a screen.
 */
import reference from '@cyberathlete/shared/seeds/reference.json';

import { contrastRatio } from '../theme/color';
import { qualityHue, TOP_LEVEL } from '../theme/hues';
import { colors, hues, typography, type ColorScheme } from '../tokens';

const SCHEMES: ColorScheme[] = ['dark', 'light'];
const BODY = 4.5;
const UI = 3;
const NUMERALS = 7;

function backgroundsOf(scheme: ColorScheme): string[] {
  const { bgAbyss, bgSurface, bgElevated } = colors[scheme];
  return [bgAbyss, bgSurface, bgElevated];
}

function worstContrast(foreground: string, backgrounds: string[]): number {
  return Math.min(...backgrounds.map((background) => contrastRatio(foreground, background)));
}

describe.each(SCHEMES)('the %s palette', (scheme) => {
  const palette = colors[scheme];
  const backgrounds = backgroundsOf(scheme);

  it.each(['textPrimary', 'textSecondary', 'textMuted', 'accent', 'copper', 'success', 'warning', 'danger'] as const)(
    '%s can set text on every background (4.5:1)',
    (token) => {
      expect(worstContrast(palette[token], backgrounds)).toBeGreaterThanOrEqual(BODY);
    },
  );

  it('text-primary is legible as a live-workout numeral on every background (7:1)', () => {
    expect(worstContrast(palette.textPrimary, backgrounds)).toBeGreaterThanOrEqual(NUMERALS);
  });

  it('border-strong can mark a control on every background (3:1)', () => {
    expect(worstContrast(palette.borderStrong, backgrounds)).toBeGreaterThanOrEqual(UI);
  });

  it('the accent edge of a selected control stands out on every background (3:1)', () => {
    expect(worstContrast(palette.accent, backgrounds)).toBeGreaterThanOrEqual(UI);
  });

  it('text-primary on an accent-deep fill is legible as a numeral (7:1): a selected RIR chip', () => {
    expect(contrastRatio(palette.textPrimary, palette.accentDeep)).toBeGreaterThanOrEqual(NUMERALS);
  });

  it('text-on-accent on an accent fill can set text (4.5:1)', () => {
    expect(contrastRatio(palette.textOnAccent, palette.accent)).toBeGreaterThanOrEqual(BODY);
  });

  it.each(['strength', 'run', 'ride', 'swim', 'walk', 'row'] as const)(
    'the %s hue can set text on every background (4.5:1)',
    (hue) => {
      expect(worstContrast(hues[scheme][hue], backgrounds)).toBeGreaterThanOrEqual(BODY);
    },
  );

  it('the quality hue can set text on every background at every level (4.5:1)', () => {
    for (let level = 1; level <= TOP_LEVEL; level += 1) {
      expect(worstContrast(qualityHue(scheme, level), backgrounds)).toBeGreaterThanOrEqual(BODY);
    }
  });
});

describe('the token file', () => {
  it('defines the same colour tokens in both themes', () => {
    expect(Object.keys(colors.light).sort()).toEqual(Object.keys(colors.dark).sort());
    expect(Object.keys(hues.light).sort()).toEqual(Object.keys(hues.dark).sort());
  });

  it('has a hue for exactly the hue tokens the seeded tracks use', () => {
    const seeded = new Set(reference.gamification_tracks.map((track) => track.hue_token));
    expect(Object.keys(hues.dark).sort()).toEqual([...seeded].sort());
  });

  it('sets every numeric style in tabular figures (INV-24)', () => {
    expect(typography.display.tabular).toBe(true);
    expect(typography.metricLg.tabular).toBe(true);
    expect(typography.metric.tabular).toBe(true);
  });
});
