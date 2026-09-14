import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme, type ViewStyle } from 'react-native';

import { colors, shadows, type ColorScheme, type HueToken } from '../tokens';
import { withOpacity } from './color';
import { trackHue } from './hues';

/** What the user chose (07 §3): follow the system, or hold one theme. Stored on the device by the caller. */
export type ThemePreference = 'system' | 'light' | 'dark';

export type ThemeColors = { readonly [Token in keyof (typeof colors)['dark']]: string };

export interface Theme {
  readonly scheme: ColorScheme;
  readonly colors: ThemeColors;
  /** The raised look of `bgElevated`: a shadow in light mode, nothing in dark mode. */
  readonly elevation: ViewStyle;
  readonly hue: (token: HueToken, level: number) => string;
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<Theme | null>(null);

/** Dark-first (07 §3): a system that states no preference gets the dark theme. */
export function resolveScheme(preference: ThemePreference, system: string | null | undefined): ColorScheme {
  if (preference !== 'system') {
    return preference;
  }
  return system === 'light' ? 'light' : 'dark';
}

function elevationOf(scheme: ColorScheme): ViewStyle {
  const shadow = shadows[scheme];
  if (shadow === null) {
    return {};
  }
  return {
    boxShadow: [{ offsetX: 0, offsetY: shadow.offsetY, blurRadius: shadow.blur, color: withOpacity(shadow.color, shadow.opacity) }],
  };
}

interface ThemeProviderProps {
  readonly preference: ThemePreference;
  /** Called with the user's new choice; the caller stores it (src/db/preferences.ts) and passes it back in. */
  readonly onPreferenceChange?: (preference: ThemePreference) => void;
  readonly children: ReactNode;
}

export function ThemeProvider({ preference, onPreferenceChange, children }: ThemeProviderProps) {
  const system = useColorScheme();
  const scheme = resolveScheme(preference, system);
  const theme = useMemo<Theme>(
    () => ({
      scheme,
      colors: colors[scheme],
      elevation: elevationOf(scheme),
      hue: (token, level) => trackHue(scheme, token, level),
      preference,
      setPreference: (next) => onPreferenceChange?.(next),
    }),
    [scheme, preference, onPreferenceChange],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error('useTheme needs a ThemeProvider above it');
  }
  return theme;
}
