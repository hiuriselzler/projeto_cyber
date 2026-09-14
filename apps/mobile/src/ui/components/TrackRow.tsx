import { StyleSheet, View } from 'react-native';

import { formatDecimal } from '../format/number';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { useTheme } from '../theme/ThemeProvider';
import { radii, space, type HueToken } from '../tokens';
import { AppText } from './AppText';

interface TrackRowProps {
  /** The track's name, already translated from its key by the caller. */
  readonly name: string;
  /** `gamification_tracks.hue_token`: related sports share a hue (07 §3). */
  readonly hue: HueToken;
  readonly level: number;
  readonly xp: number;
  /** XP at which the next level begins, or null at the top level. */
  readonly nextLevelXp: number | null;
  /** What earned the most recent award, stated as a fact (07 §6) — already translated. */
  readonly lastAward?: string | null;
}

/**
 * One row of the Progress screen, which is a plain list of these (07 §6). The hue is one signal among several — the
 * name, the level and the numbers all say the same thing without it (INV-24). No figure, no arms, no radial chart.
 */
export function TrackRow({ name, hue, level, xp, nextLevelXp, lastAward = null }: TrackRowProps) {
  const theme = useTheme();
  const { locale } = useLocale();
  const t = useT();
  const colour = theme.hue(hue, level);
  const whole = (value: number) => formatDecimal(value, locale, { maxFractionDigits: 0 });
  const fraction = nextLevelXp === null || nextLevelXp <= 0 ? 1 : Math.min(1, Math.max(0, xp / nextLevelXp));

  const label = t('a11y.track_row', {
    name,
    level,
    progress:
      nextLevelXp === null
        ? t('a11y.track_progress_top', { xp: whole(xp) })
        : t('a11y.track_progress', { xp: whole(xp), next: whole(nextLevelXp) }),
    has_reason: lastAward === null ? 'no' : 'yes',
    reason: lastAward ?? '',
  });

  return (
    <View accessible accessibilityLabel={label} style={[styles.row, { backgroundColor: theme.colors.bgSurface }]}>
      <View testID="track-row-hue" style={[styles.hue, { backgroundColor: colour }]} />
      <View style={styles.body}>
        <View style={styles.heading}>
          <AppText variant="title">{name}</AppText>
          <AppText variant="label" tone="textSecondary">
            {t('ui.track_row.level', { level })}
          </AppText>
        </View>
        <View style={[styles.bar, { backgroundColor: theme.colors.borderSubtle }]}>
          <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: colour }]} />
        </View>
        <AppText variant="caption" tone="textSecondary">
          {nextLevelXp === null
            ? t('ui.track_row.xp_top', { xp: whole(xp) })
            : t('ui.track_row.xp', { xp: whole(xp), next: whole(nextLevelXp) })}
        </AppText>
        {lastAward === null ? null : (
          <AppText variant="caption" tone="textMuted">
            {lastAward}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radii.lg },
  hue: { width: space[1], borderRadius: radii.sm, alignSelf: 'stretch' },
  body: { flex: 1, gap: space[1] },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: space[2] },
  bar: { height: space[2], borderRadius: radii.sm, overflow: 'hidden' },
  fill: { height: space[2], borderRadius: radii.sm },
});
