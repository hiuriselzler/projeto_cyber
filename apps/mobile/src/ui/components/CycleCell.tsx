import { Pressable, StyleSheet, View } from 'react-native';

import { useT } from '../i18n/LocaleProvider';
import { useTheme, type ThemeColors } from '../theme/ThemeProvider';
import { radii, sizes, space } from '../tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

/** A microcycle's status (INV-06). */
export type CycleStatus = 'projected' | 'locked' | 'in_progress' | 'completed' | 'skipped';

/** Every status is a shape as well as a colour (07 §6, INV-24). The component chooses both; callers pass the state. */
const LOOK: Record<CycleStatus, { readonly icon: IconName; readonly tone: keyof ThemeColors }> = {
  projected: { icon: 'projected', tone: 'textMuted' },
  locked: { icon: 'lock', tone: 'textSecondary' },
  in_progress: { icon: 'inProgress', tone: 'accent' },
  completed: { icon: 'check', tone: 'success' },
  skipped: { icon: 'skipped', tone: 'textMuted' },
};

interface CycleCellProps {
  /** The position within the microcycle, 1..N — never a weekday (INV-25). */
  readonly dayIndex: number;
  readonly status: CycleStatus;
  readonly deload?: boolean;
  /** Already translated by the caller, or the user's own routine name as typed (INV-27). */
  readonly sessionLabel?: string;
  readonly onPress?: () => void;
}

/** One day of the plan grid (07 §6). Deload cycles are quieter and marked in words, not by colour alone. */
export function CycleCell({ dayIndex, status, deload = false, sessionLabel, onPress }: CycleCellProps) {
  const { colors } = useTheme();
  const t = useT();
  const look = LOOK[status];
  const label = t('a11y.cycle_cell', {
    day: dayIndex,
    status: t(`ui.cycle_status.${status}`),
    deload: deload ? 'yes' : 'no',
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.cell,
        {
          backgroundColor: deload ? colors.bgSurface : colors.bgElevated,
          borderColor: status === 'in_progress' ? colors.accent : colors.borderStrong,
          borderWidth: status === 'in_progress' ? sizes.edgeSelected : sizes.edgeHairline,
        },
      ]}
    >
      <View style={styles.header}>
        <AppText variant="label" tone="textSecondary">
          {t('ui.cycle_cell.day', { day: dayIndex })}
        </AppText>
        <Icon name={look.icon} color={colors[look.tone]} />
      </View>
      {sessionLabel === undefined ? null : (
        <AppText variant="caption" tone={deload ? 'textMuted' : 'textPrimary'}>
          {sessionLabel}
        </AppText>
      )}
      {deload ? (
        <AppText variant="caption" tone="textSecondary">
          {t('ui.cycle_cell.deload')}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: { minHeight: sizes.targetMin, minWidth: sizes.targetMin, padding: space[2], gap: space[1], borderRadius: radii.md },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[1] },
});
