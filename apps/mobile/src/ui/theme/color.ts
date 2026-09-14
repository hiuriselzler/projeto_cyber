/**
 * Colour arithmetic over token values: WCAG contrast for the token test (07 §3, ADR-014), and the quality hue's
 * interpolation by level. It computes colours from tokens; it never introduces one.
 */

type Rgb = readonly [number, number, number];

function parseHex(hex: string): Rgb {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as unknown as Rgb;
}

function toHex([red, green, blue]: Rgb): string {
  return `#${[red, green, blue].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a `#RRGGBB` colour. */
export function relativeLuminance(hex: string): number {
  const [red, green, blue] = parseHex(hex).map(linearChannel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG 2.x contrast ratio between two `#RRGGBB` colours, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** A token colour at an opacity, as React Native takes it. */
export function withOpacity(hex: string, opacity: number): string {
  const [red, green, blue] = parseHex(hex);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

/** The colour `fraction` of the way from `from` to `to`, mixed per sRGB channel. */
export function mix(from: string, to: string, fraction: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  const start = parseHex(from);
  const end = parseHex(to);
  return toHex([0, 1, 2].map((index) => start[index] + (end[index] - start[index]) * clamped) as unknown as Rgb);
}
