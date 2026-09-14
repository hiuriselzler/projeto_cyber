import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';

import { useT } from '../i18n/LocaleProvider';
import { easingOf, motionFor } from '../motion/motion';
import { useReduceMotion } from '../motion/useReduceMotion';
import { useTheme } from '../theme/ThemeProvider';
import { radii, sizes, space } from '../tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

interface SheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** Already translated by the caller. */
  readonly title?: string;
  readonly children: ReactNode;
}

/**
 * A bottom sheet, within thumb reach (07 §5). It rises on the house curve over a transition's 240 ms; under reduce
 * motion it only cross-fades (07 §7). The close button is a full-size target, never a small corner cross.
 */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const theme = useTheme();
  const t = useT();
  const reduceMotion = useReduceMotion();
  // Held in state, not a ref: the value is read while rendering, and created once.
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));
  // On screen while visible, and until the closing animation has finished.
  const [mounted, setMounted] = useState(visible);
  const [lastVisible, setLastVisible] = useState(visible);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) setMounted(true);
  }

  useEffect(() => {
    const motion = motionFor('transition', reduceMotion);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: motion.duration,
      easing: easingOf(motion),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, progress, reduceMotion]);

  if (!mounted) {
    return null;
  }

  const moves = motionFor('transition', reduceMotion).style === 'move';
  const rise = moves ? progress.interpolate({ inputRange: [0, 1], outputRange: [space[12], 0] }) : 0;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={styles.frame}>
        <Pressable style={styles.dismiss} onPress={onClose} accessible={false} />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            theme.elevation,
            {
              opacity: progress,
              transform: [{ translateY: rise }],
              backgroundColor: theme.colors.bgElevated,
              borderColor: theme.colors.borderStrong,
            },
          ]}
        >
          <View style={styles.header}>
            {title === undefined ? <View /> : <AppText variant="title">{title}</AppText>}
            <Pressable accessibilityRole="button" accessibilityLabel={t('ui.sheet.close')} onPress={onClose} style={styles.close}>
              <Icon name="close" color={theme.colors.textPrimary} />
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: {
    padding: space[4],
    gap: space[3],
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderTopWidth: sizes.edgeHairline,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  close: { minWidth: sizes.targetMin, minHeight: sizes.targetMin, alignItems: 'center', justifyContent: 'center' },
});
