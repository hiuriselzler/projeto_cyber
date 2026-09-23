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

  useEffect(() => {
    const motion = motionFor('transition', reduceMotion);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: motion.duration,
      easing: easingOf(motion),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, progress, reduceMotion]);

  /**
   * **Mounted exactly when the caller says visible — no state of its own.**
   *
   * The earlier version kept a `mounted` flag so the sheet could stay on screen through a closing animation, and set
   * it *during render* from `if (visible !== lastVisible)`. On a device that did not work: with the React Compiler
   * enabled (`app.json` § experiments), the sibling `setLastVisible` in the same block took effect and `setMounted`
   * was lost, so `mounted` stayed false and **the sheet never opened at all**. Task 011's two tests could not catch
   * it — both pass `visible` as a constant and never move it, so the false → true path had never run anywhere.
   * Found on a phone in task 004 stage 3.
   *
   * The rise on open is unchanged (07 §7). What this costs is the fade *out*: the sheet leaves at once instead of
   * over 240 ms.
   *
   * **⚠ Restoring the exit was attempted on 2026-09-21 and reverted — the obvious implementation is blocked by this
   * project's own lint.** Keeping the sheet mounted through its fade needs one state write at the moment `visible`
   * goes true → false. Doing it during render is the defect above. Doing it in an effect is
   * `react-hooks/set-state-in-effect`, an **error** here, and the rule is right in general. Unmounting from the
   * animation's completion callback is allowed and solves only half of it: something still has to turn mounting
   * *on*. So the exit needs a different mechanism — driving the transition from the caller, or reanimated's
   * `exiting` animations, which are built for exactly this and whose library is already a dependency. That is a
   * design-system decision with an owner, not a workaround to slip in behind an `eslint-disable`, and it is recorded
   * as open in [task 004](../../../../../docs/tasks/004-exercise-catalog-and-logging.md).
   */
  if (!visible) {
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
