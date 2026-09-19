import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { listExercises, type CatalogExercise } from '@/db/catalog';
import { AppText, Sheet, sizes, space, useT, useTheme } from '@/ui';

import { exerciseLabel } from './exerciseName';

interface ExercisePickerProps {
  readonly visible: boolean;
  readonly userId: string;
  readonly onClose: () => void;
  readonly onPick: (exerciseId: string) => void;
}

/**
 * The smallest thing that puts an exercise into a workout: the catalog, in name order, in a sheet.
 *
 * **Browse, search and filter are stage 4's**, with the catalog screen that owns them — the bilingual matcher stage 2
 * built (`matchesSearch`, so that *supino* and *bench* both find the bench press) plugs in there. Stage 3 exists to
 * judge the set row, and a picker good enough to reach one is the right amount of picker to build first.
 */
export function ExercisePicker({ visible, userId, onClose, onPick }: ExercisePickerProps) {
  const t = useT();
  const { colors } = useTheme();
  // Read once per opening rather than per render: the catalog is 201 rows and does not change while the sheet is up.
  const exercises = useMemo(() => (visible ? listExercises(userId) : []), [visible, userId]);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('workout.choose_exercise')}>
      <FlatList
        data={exercises}
        keyExtractor={(exercise: CatalogExercise) => exercise.id}
        style={styles.list}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={exerciseLabel(item, t)}
            onPress={() => onPick(item.id)}
            style={[styles.row, { borderBottomColor: colors.borderSubtle }]}
          >
            <AppText>{exerciseLabel(item, t)}</AppText>
          </Pressable>
        )}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Shrinks rather than a fixed cap: the sheet then fits any screen, and 201 rows cannot push it past the top.
  list: { flexShrink: 1 },
  row: {
    minHeight: sizes.targetMin,
    justifyContent: 'center',
    paddingHorizontal: space[2],
    borderBottomWidth: sizes.edgeHairline,
  },
});
