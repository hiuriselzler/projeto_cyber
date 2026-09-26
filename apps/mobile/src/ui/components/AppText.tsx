import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { useTheme, type ThemeColors } from '../theme/ThemeProvider';
import { maxFontScale, typeScale, typography, type TypeVariant } from '../tokens';

export type TextTone = 'textPrimary' | 'textSecondary' | 'textMuted' | 'textOnAccent' | 'accent' | 'danger' | 'success' | 'warning';

export interface AppTextProps extends Omit<TextProps, 'style'> {
  readonly variant?: TypeVariant;
  readonly tone?: TextTone & keyof ThemeColors;
  /**
   * Tabular figures for a changing number set in a text style — the rest countdown in the keypad's heading line, which
   * must hold that line's height (INV-24). Numeric styles are tabular already; this never turns them off.
   */
  readonly tabular?: boolean;
  readonly style?: StyleProp<TextStyle>;
}

/** The style one step smaller than `variant`, which is where a unit is set beside its number (07 §4). */
export function unitVariantOf(variant: TypeVariant): TypeVariant {
  const index = typeScale.indexOf(variant);
  return typeScale[Math.min(index + 1, typeScale.length - 1)];
}

/**
 * Every piece of text in the app. Type comes from a token style, colour from the theme, numeric styles are tabular
 * (INV-24), and the system font scale is honoured up to 200 % (07 §8).
 */
export function AppText({ variant = 'body', tone = 'textPrimary', tabular = false, style, ...rest }: AppTextProps) {
  const theme = useTheme();
  const type = typography[variant];
  return (
    <Text
      maxFontSizeMultiplier={maxFontScale}
      style={[
        {
          fontFamily: type.fontFamily,
          fontSize: type.fontSize,
          lineHeight: type.lineHeight,
          letterSpacing: type.letterSpacing,
          color: theme.colors[tone],
          fontVariant: type.tabular || tabular ? ['tabular-nums'] : undefined,
        },
        style,
      ]}
      {...rest}
    />
  );
}
