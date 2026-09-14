/**
 * The design system's one token file (INV-23, ADR-014). Every colour, type style, spacing, radius, size, easing and
 * duration the app uses is written here and nowhere else; docs/07-brand-and-ui.md §3, §4 and §7 hold the values and
 * the reasons for them. A literal of any of these kinds outside this file fails lint (fence `design-tokens`).
 *
 * Plain data with no imports, so build scripts read it as well: scripts/render-brand-assets.mjs and the app config
 * test take their colours from here.
 */

/** 07 §3. Every token exists in both themes, with the same use. */
export const colors = {
  dark: {
    bgAbyss: '#0A0D12',
    bgSurface: '#131820',
    bgElevated: '#1C232E',
    borderSubtle: '#232C38',
    borderStrong: '#5F7081',
    textPrimary: '#E8EDF2',
    textSecondary: '#9AA7B5',
    textMuted: '#7F8C9A',
    textOnAccent: '#0A0D12',
    accent: '#4A9FD4',
    accentDeep: '#135278',
    copper: '#C67B45',
    success: '#4FA88B',
    warning: '#D9A441',
    danger: '#D96962',
  },
  light: {
    bgAbyss: '#F4F6F8',
    bgSurface: '#FFFFFF',
    bgElevated: '#FFFFFF',
    borderSubtle: '#DFE5EB',
    borderStrong: '#7D8EA0',
    textPrimary: '#0F1519',
    textSecondary: '#4A5764',
    textMuted: '#64717E',
    textOnAccent: '#FFFFFF',
    accent: '#1F6F9E',
    accentDeep: '#D0E8FA',
    copper: '#9A5B2C',
    success: '#2F7A62',
    warning: '#926702',
    danger: '#A63F3A',
  },
} as const;

/** 07 §3. Dark mode shows elevation by `bgElevated` alone; light mode raises it with a shadow. */
export const shadows = {
  dark: null,
  light: { color: '#0F1519', opacity: 0.12, offsetY: 2, blur: 8 },
} as const;

/**
 * 07 §3, discipline hues. Keyed by `gamification_tracks.hue_token`, so the sharing between related sports is data.
 * `quality` runs from `from` at level 1 to `to` at the top level.
 */
export const hues = {
  dark: {
    strength: '#C67B45',
    run: '#4A9FD4',
    ride: '#8E7EDB',
    swim: '#3FB5B5',
    walk: '#7FA86B',
    row: '#D06B86',
    quality: { from: '#8494A4', to: '#B8C4D0' },
  },
  light: {
    strength: '#9A5B2C',
    run: '#1F6F9E',
    ride: '#5B4CA8',
    swim: '#187B7B',
    walk: '#4C6B3E',
    row: '#8E3A52',
    quality: { from: '#5A6874', to: '#2C3742' },
  },
} as const;

/** 07 §4. Font family names are the bundled files' names, which is how Android resolves them. */
export const fontFamilies = {
  interRegular: 'Inter-Regular',
  interMedium: 'Inter-Medium',
  interSemiBold: 'Inter-SemiBold',
  interDisplaySemiBold: 'InterDisplay-SemiBold',
} as const;

/** 07 §4. Every numeric style carries tabular figures (INV-24). Letter spacing stays 0 everywhere. */
export const typography = {
  display: { fontFamily: fontFamilies.interDisplaySemiBold, fontSize: 48, lineHeight: 52, letterSpacing: 0, tabular: true },
  metricLg: { fontFamily: fontFamilies.interDisplaySemiBold, fontSize: 34, lineHeight: 38, letterSpacing: 0, tabular: true },
  metric: { fontFamily: fontFamilies.interSemiBold, fontSize: 24, lineHeight: 28, letterSpacing: 0, tabular: true },
  title: { fontFamily: fontFamilies.interSemiBold, fontSize: 20, lineHeight: 26, letterSpacing: 0, tabular: false },
  body: { fontFamily: fontFamilies.interRegular, fontSize: 16, lineHeight: 22, letterSpacing: 0, tabular: false },
  label: { fontFamily: fontFamilies.interMedium, fontSize: 14, lineHeight: 18, letterSpacing: 0, tabular: false },
  caption: { fontFamily: fontFamilies.interRegular, fontSize: 12, lineHeight: 16, letterSpacing: 0, tabular: false },
} as const;

/** Largest first. A unit is set one step smaller than its number (07 §4). */
export const typeScale = ['display', 'metricLg', 'metric', 'title', 'body', 'label', 'caption'] as const;

/** 07 §4. The largest multiplier the system font scale may apply (07 §8: 200 %). */
export const maxFontScale = 2;

/** 07 §4, in dp. A 4 dp base. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48 } as const;

/** 07 §4, in dp. Nothing is fully round except a status dot. */
export const radii = { sm: 4, md: 8, lg: 12 } as const;

/** 07 §4, in dp. */
export const sizes = {
  targetMin: 48,
  targetWorkout: 56,
  icon: 24,
  edgeHairline: 1,
  edgeSelected: 2,
} as const;

/** 07 §7. The house easing is a cubic-bezier fit to a critically-damped step response. */
export const easing = { house: [0.18, 0, 0.06, 1] } as const;

/** 07 §7, in milliseconds. Under reduce motion every transition becomes a `crossFade`. */
export const durations = { stateChange: 120, transition: 240, emphasis: 600, crossFade: 120 } as const;

export type ColorScheme = keyof typeof colors;
export type ColorToken = keyof (typeof colors)['dark'];
export type HueToken = keyof (typeof hues)['dark'];
export type TypeVariant = keyof typeof typography;
