import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { easingOf, motionFor } from '../motion/motion';
import { useReduceMotion } from '../motion/useReduceMotion';
import { useTheme } from '../theme/ThemeProvider';
import { radii, space } from '../tokens';
import { AppText } from './AppText';

/** One record, every part already translated and formatted by the caller — this component knows no exercise. */
export interface RecordLine {
  readonly key: string;
  /** What kind of record — "Heaviest weight". */
  readonly kind: string;
  /** Whose — the exercise, translated for a global and exactly as typed for the user's own (INV-27). */
  readonly subject: string;
  /** The new value, in the user's unit system and locale (INV-01). */
  readonly value: string;
}

interface RecordStateProps {
  /** Already translated: "New personal records". */
  readonly title: string;
  readonly records: readonly RecordLine[];
}

/**
 * Personal records, said quietly (08 §6) — the finish flow's celebration (task 004 stage 6).
 *
 * **One** damped 600 ms emphasis for the whole list, played once, and each record stated as a fact: its kind, whose,
 * and the number. No confetti, no fanfare, no count-up, no per-record fireworks — celebration exists, but it is quiet and
 * earned. Under reduce motion the emphasis is a static state (07 §7). A record is named in words, never marked by
 * colour alone (INV-24).
 */
export function RecordState({ title, records }: RecordStateProps) {
  const theme = useTheme();
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
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        theme.elevation,
        { opacity: shown, transform: [{ translateY: rise }], backgroundColor: theme.colors.bgElevated },
      ]}
    >
      <View style={[styles.rule, { backgroundColor: theme.colors.copper }]} />
      <View style={styles.body}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {records.map((record) => (
          <View key={record.key} accessible style={styles.record}>
            <AppText variant="label" tone="textSecondary">
              {record.kind}
            </AppText>
            <AppText>{record.subject}</AppText>
            <AppText variant="metric">{record.value}</AppText>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radii.lg },
  rule: { width: space[1], borderRadius: radii.sm, alignSelf: 'stretch' },
  body: { flex: 1, gap: space[3] },
  record: { gap: space[1] },
});
