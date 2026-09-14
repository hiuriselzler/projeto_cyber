/**
 * The design system (07, task 011): the token file (INV-23), theme, motion, the i18n runtime, the one formatting module
 * that converts units (INV-01), and the components every screen is built from. Features import from here.
 */
export * from './tokens';

export { resolveScheme, ThemeProvider, useTheme, type Theme, type ThemeColors, type ThemePreference } from './theme/ThemeProvider';
export { qualityHue, trackHue } from './theme/hues';

export { defaultsFromDevice, type LanguageAndUnits } from './i18n/device';
export { readDeviceDefaults } from './i18n/deviceLocales';
export { LocaleProvider, useLocale, useT } from './i18n/LocaleProvider';
export { spokenQuantity } from './i18n/spoken';

export * from './format/number';
export * from './format/quantities';

export { easingOf, houseEasing, motionFor, type MotionKind, type MotionSpec } from './motion/motion';
export { useReduceMotion } from './motion/useReduceMotion';

export { AppText, unitVariantOf, type AppTextProps, type TextTone } from './components/AppText';
export { Button, type ButtonProps } from './components/Button';
export { Chip, type ChipProps } from './components/Chip';
export { CycleCell, type CycleStatus } from './components/CycleCell';
export { EmptyState } from './components/EmptyState';
export { Icon, type IconName } from './components/Icon';
export {
  applyKey,
  normalizeKeypadValue,
  offsetToReveal,
  type KeypadKey,
  type KeypadRules,
  type RevealGeometry,
} from './components/keypad';
export { LevelUpState } from './components/LevelUpState';
export { Mark, type MarkLevel } from './components/Mark';
export { MetricTile } from './components/MetricTile';
export { NumericKeypad } from './components/NumericKeypad';
export { RirChips } from './components/RirChips';
export { Screen } from './components/Screen';
export { SegmentedControl, type SegmentedOption } from './components/SegmentedControl';
export { SetRow, type PreviousSet, type SetRowField, type SetRowProps } from './components/SetRow';
export { Sheet } from './components/Sheet';
export { TextField, type TextFieldProps } from './components/TextField';
export { TrackRow } from './components/TrackRow';
