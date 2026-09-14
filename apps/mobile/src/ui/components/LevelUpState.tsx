import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useT } from '../i18n/LocaleProvider';
import { easingOf, motionFor } from '../motion/motion';
import { useReduceMotion } from '../motion/useReduceMotion';
import { useTheme } from '../theme/ThemeProvider';
import { radii, space, type HueToken } from '../tokens';
import { AppText } from './AppText';

interface LevelUpStateProps {
  /** Already translated by the caller. */
  readonly trackName: string;
  readonly hue: HueToken;
  readonly level: number;
  /** What earned it, stated as a fact (07 §6) — already translated. */
  readonly reason: string;
}

/**
 * A level reached, said quietly (08 §6): one damped 600 ms emphasis, played once, and a clear statement of the fact.
 * No confetti, no fanfare. Under reduce motion the emphasis is a static state (07 §7).
 */
export function LevelUpState({ trackName, hue, level, reason }: LevelUpStateProps) {
  const theme = useTheme();
  const t = useT();
  const reduceMotion = useReduceMotion();
  // Held in state, not a ref: the value is read while rendering, and created once.
  const [shown] = useState(() => new Animated.Value(motionFor('emphasis', reduceMotion).style === 'none' ? 1 : 0));

  useEffect(() => {
    const motion = motionFor('emphasis', reduceMotion);
    if (motion.style === 'none') {
      shown.setValue(1);
      return;
    }
    // Once: the effect runs again only if reduce motion changes, and then the card is already shown.
    Animated.timing(shown, { toValue: 1, duration: motion.duration, easing: easingOf(motion), useNativeDriver: true }).start();
  }, [shown, reduceMotion]);

  const moves = motionFor('emphasis', reduceMotion).style === 'move';
  const rise = moves ? shown.interpolate({ inputRange: [0, 1], outputRange: [space[2], 0] }) : 0;

  return (
    <Animated.View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={t('a11y.level_up', { track: trackName, level, reason })}
      style={[
        styles.card,
        theme.elevation,
        { opacity: shown, transform: [{ translateY: rise }], backgroundColor: theme.colors.bgElevated },
      ]}
    >
      <View style={[styles.hue, { backgroundColor: theme.hue(hue, level) }]} />
      <View style={styles.body}>
        <AppText variant="label" tone="textSecondary">
          {trackName}
        </AppText>
        <AppText variant="metricLg">{t('ui.level_up.title', { level })}</AppText>
        <AppText tone="textSecondary">{reason}</AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radii.lg },
  hue: { width: space[1], borderRadius: radii.sm, alignSelf: 'stretch' },
  body: { flex: 1, gap: space[1] },
});
