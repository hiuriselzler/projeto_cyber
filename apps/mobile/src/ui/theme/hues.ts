import { hues, type ColorScheme, type HueToken } from '../tokens';
import { mix } from './color';

/** The highest level in the frozen threshold table (08 §2, ADR-010). */
export const TOP_LEVEL = 30;

/** The quality hue at a level: `from` at level 1, `to` at the top level (07 §3). */
export function qualityHue(scheme: ColorScheme, level: number): string {
  const { from, to } = hues[scheme].quality;
  return mix(from, to, (Math.min(TOP_LEVEL, Math.max(1, level)) - 1) / (TOP_LEVEL - 1));
}

/** A track's hue, from its seeded `hue_token`. Colour is never the only signal a track row carries (INV-24). */
export function trackHue(scheme: ColorScheme, token: HueToken, level: number): string {
  return token === 'quality' ? qualityHue(scheme, level) : hues[scheme][token];
}
