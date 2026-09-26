import { StyleSheet, View } from 'react-native';

import type { SetType } from '@/db/strength';
import { AppText, Button, Chip, Sheet, space, useT } from '@/ui';

/** In the order a session runs them: warm-ups first, the working sets, then what follows them. */
export const SET_TYPES: readonly SetType[] = ['warmup', 'working', 'drop', 'backoff', 'amrap'];

interface SetTypeSheetProps {
  readonly visible: boolean;
  readonly setNumber: number;
  readonly setType: SetType;
  readonly onChoose: (setType: SetType) => void;
  readonly onRemove: () => void;
  readonly onClose: () => void;
}

/**
 * One set's type, and the way to remove it — FR-2.9 and FR-2.8.
 *
 * Reached from the set number, a visible control, with long-press as a shortcut (07 §5, task 004 § Stages, decision 5).
 * Removing a set lives here rather than on the row: it is rare, it must not sit next to the ✓ where a sweaty thumb
 * lands, and a set's own menu is where anyone looks for it.
 */
export function SetTypeSheet({ visible, setNumber, setType, onChoose, onRemove, onClose }: SetTypeSheetProps) {
  const t = useT();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('workout.set_type_title', { number: setNumber })}>
      <View style={styles.body}>
        <View style={styles.chips}>
          {SET_TYPES.map((type) => (
            <Chip
              key={type}
              size="workout"
              role="radio"
              label={t(`set_type.${type}`)}
              selected={type === setType}
              onPress={() => onChoose(type)}
            />
          ))}
        </View>
        <AppText variant="caption" tone="textMuted">
          {t('workout.set_type_note')}
        </AppText>
        <Button variant="secondary" label={t('workout.remove_set')} onPress={onRemove} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[3], paddingBottom: space[4] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
