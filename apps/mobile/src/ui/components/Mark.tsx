import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { MARKS, type MarkLevel } from '../brand/marks.generated';
import { useT } from '../i18n/LocaleProvider';
import { useTheme } from '../theme/ThemeProvider';

export type { MarkLevel };

interface MarkProps {
  /** Which step of 07's ladder, chosen by the size it is shown at (07 §1). */
  readonly level: MarkLevel;
  readonly size: number;
}

/**
 * The octopus mark, in one flat colour. A brand figure only: it takes no data and never changes with anyone's training
 * (07 §2). Until task 018 replaces the SVG sources, every level draws task 011's placeholder.
 */
export function Mark({ level, size }: MarkProps) {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={t('brand.name')} testID={`mark-${level}`}>
      <SvgXml xml={MARKS[level]} width={size} height={size} color={colors.textPrimary} />
    </View>
  );
}
