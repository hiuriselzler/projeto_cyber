import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { listExercises, type CatalogExercise } from '@/db/catalog';
import { AppText, EmptyState, Sheet, sizes, space, TextField, useLocale, useT, useTheme } from '@/ui';

import { filterCatalog, NO_FILTER } from './catalogFilter';
import { exerciseLabel, type Translate } from './exerciseName';

interface ExercisePickerProps {
  readonly visible: boolean;
  readonly userId: string;
  readonly onClose: () => void;
  readonly onPick: (exerciseId: string) => void;
}

/**
 * The catalog, searchable, in a sheet — what puts an exercise into a workout (FR-2.8).
 *
 * **Browse, search and filter were stage 4's**, and this is where they plug in: the same `filterCatalog` the catalog
 * screen uses, so *supino* and *bench* both find the bench press here too, and a hidden exercise (this screen's own
 * `listExercises` already excludes it) never shows up mid-workout either. Muscle and equipment filters stay the
 * catalog screen's own — picking a set of sets to do is not the moment to browse by muscle group.
 */
export function ExercisePicker({ visible, userId, onClose, onPick }: ExercisePickerProps) {
  const t = useT();
  const { locale } = useLocale();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');

  const translate = useCallback<Translate>((key, options) => t(key, options), [t]);

  // Read once per opening rather than per render: the catalog is 201 rows and does not change while the sheet is up.
  const all = useMemo(() => (visible ? listExercises(userId) : []), [visible, userId]);
  const shown = useMemo(() => filterCatalog(all, { ...NO_FILTER, query }, translate, locale), [all, query, translate, locale]);

  // Cleared from the handlers that end this opening, not from an effect on `visible` — `react-hooks/set-state-in-effect`
  // is an error in this project (Sheet's own lesson, task 004 stage 3), and there is no render-phase need for it here.
  const closeAndReset = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);
  const pickAndReset = useCallback(
    (exerciseId: string) => {
      setQuery('');
      onPick(exerciseId);
    },
    [onPick],
  );

  return (
    <Sheet visible={visible} onClose={closeAndReset} title={t('workout.choose_exercise')}>
      <TextField
        label={t('catalog.search')}
        hint={t('catalog.search_hint')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      {shown.length === 0 ? (
        <EmptyState title={t('catalog.empty_title')} body={t('catalog.empty_body')} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(exercise: CatalogExercise) => exercise.id}
          style={styles.list}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={exerciseLabel(item, t)}
              onPress={() => pickAndReset(item.id)}
              style={[styles.row, { borderBottomColor: colors.borderSubtle }]}
            >
              <AppText>{exerciseLabel(item, t)}</AppText>
            </Pressable>
          )}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Shrinks rather than a fixed cap: the sheet then fits any screen, and 201 rows cannot push it past the top.
  list: { flexShrink: 1, marginTop: space[2] },
  row: {
    minHeight: sizes.targetMin,
    justifyContent: 'center',
    paddingHorizontal: space[2],
    borderBottomWidth: sizes.edgeHairline,
  },
});
