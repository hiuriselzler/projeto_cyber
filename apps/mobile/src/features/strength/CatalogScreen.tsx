import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  listArchivedExercises,
  listExercises,
  listMuscleGroups,
  MODALITIES,
  setExerciseArchived,
  type CatalogExercise,
} from '@/db/catalog';
import { AppText, Button, Chip, EmptyState, Screen, sizes, space, TextField, useLocale, useT, useTheme } from '@/ui';

import { filterCatalog, isFiltered, NO_FILTER, sortForDisplay, type CatalogFilter } from './catalogFilter';
import { exerciseLabel, type Translate } from './exerciseName';
import { ExerciseForm, type FormTarget } from './ExerciseForm';
import { useSignedInUserId } from './useLiveWorkout';

/**
 * The exercise catalog — FR-2.1–2.4, task 004 stage 4.
 *
 * 201 seeded exercises plus whatever the user has made, searchable in **either language** (ADR-008), filterable by
 * muscle and equipment, and editable — where editing a seeded one **forks it** rather than changing a row every user
 * shares (FR-2.2).
 *
 * The screen holds filter state and nothing else. Every read is a function of the database, and every write goes
 * through `src/db/catalog.ts` and is followed by a re-read: the same rule the live workout follows (INV-09), for the
 * same reason — React state that is the only copy of something is a bug waiting for a crash.
 */
export function CatalogScreen() {
  const t = useT();
  const { locale } = useLocale();
  const userId = useSignedInUserId();

  const [filter, setFilter] = useState<CatalogFilter>(NO_FILTER);
  const [target, setTarget] = useState<FormTarget | null>(null);
  /** Which of the two lists this screen shows — the active catalog, or what has been hidden from it. */
  const [showHidden, setShowHidden] = useState(false);
  /** Bumped after every write, so the list re-reads from SQLite rather than being patched in memory. */
  const [revision, setRevision] = useState(0);

  /** `t` with the language made explicit, so a global can be matched against its name in both catalogs. */
  const translate = useCallback<Translate>((key, options) => t(key, options), [t]);

  const all = useMemo(() => {
    // `revision` is read so the dependency is real to the linter as well as to us: it is what re-runs this read
    // after a write, and the whole point is that the list comes back from SQLite rather than being patched in place.
    void revision;
    return userId === null ? [] : listExercises(userId);
  }, [userId, revision]);
  // Reference data, seeded once and never written by this screen, so it is not tied to `revision`.
  const muscles = useMemo(() => (userId === null ? [] : listMuscleGroups()), [userId]);
  const shown = useMemo(() => filterCatalog(all, filter, translate, locale), [all, filter, translate, locale]);

  const hidden = useMemo(() => {
    void revision;
    return userId === null ? [] : listArchivedExercises(userId);
  }, [userId, revision]);
  const shownHidden = useMemo(() => sortForDisplay(hidden, translate, locale), [hidden, translate, locale]);

  const onSaved = useCallback(() => {
    setTarget(null);
    setRevision((current) => current + 1);
  }, []);

  const unhide = useCallback(
    (exerciseId: string) => {
      if (userId === null) return;
      setExerciseArchived({ userId, exerciseId, archived: false, now: Date.now() });
      setRevision((current) => current + 1);
    },
    [userId],
  );

  if (userId === null) {
    return <Screen />;
  }

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">{t('catalog.title')}</AppText>
        <Button label={t('catalog.create')} onPress={() => setTarget({ kind: 'new' })} />
      </View>

      <View style={styles.modeRow}>
        <Chip
          label={t('catalog.hidden_title')}
          role="checkbox"
          selected={showHidden}
          onPress={() => setShowHidden((current) => !current)}
        />
      </View>

      {showHidden ? (
        shownHidden.length === 0 ? (
          <EmptyState title={t('catalog.hidden_title')} body={t('catalog.hidden_empty')} />
        ) : (
          <>
            <AppText variant="caption" tone="textMuted" style={styles.hiddenNote}>
              {t('catalog.hidden_note')}
            </AppText>
            <FlatList
              data={shownHidden}
              keyExtractor={(exercise: CatalogExercise) => exercise.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <HiddenRow exercise={item} label={exerciseLabel(item, t)} onUnhide={() => unhide(item.id)} />
              )}
            />
          </>
        )
      ) : (
        <>
          <View style={styles.controls}>
            <TextField
              label={t('catalog.search')}
              hint={t('catalog.search_hint')}
              value={filter.query}
              onChangeText={(query) => setFilter((current) => ({ ...current, query }))}
              autoCapitalize="none"
            />

            <FilterRow label={t('catalog.filter_modality')}>
              <Chip
                label={t('catalog.filter_all')}
                role="radio"
                selected={filter.modality === null}
                onPress={() => setFilter((current) => ({ ...current, modality: null }))}
              />
              {MODALITIES.map((modality) => (
                <Chip
                  key={modality}
                  label={t(`modality.${modality}`)}
                  role="radio"
                  selected={filter.modality === modality}
                  onPress={() =>
                    setFilter((current) => ({ ...current, modality: sameOrNull(current.modality, modality) }))
                  }
                />
              ))}
            </FilterRow>

            <FilterRow label={t('catalog.filter_muscle')}>
              <Chip
                label={t('catalog.filter_all')}
                role="radio"
                selected={filter.muscleId === null}
                onPress={() => setFilter((current) => ({ ...current, muscleId: null }))}
              />
              {muscles.map((muscle) => (
                <Chip
                  key={muscle.id}
                  label={t(muscle.nameKey)}
                  role="radio"
                  selected={filter.muscleId === muscle.id}
                  onPress={() =>
                    setFilter((current) => ({ ...current, muscleId: sameOrNull(current.muscleId, muscle.id) }))
                  }
                />
              ))}
            </FilterRow>

            <View style={styles.summary}>
              <Chip
                label={t('catalog.filter_mine')}
                role="checkbox"
                selected={filter.mineOnly}
                onPress={() => setFilter((current) => ({ ...current, mineOnly: !current.mineOnly }))}
              />
              <AppText variant="caption" tone="textMuted">
                {t('catalog.count', { count: shown.length })}
              </AppText>
            </View>
          </View>

          {shown.length === 0 ? (
            <EmptyState
              title={t('catalog.empty_title')}
              body={isFiltered(filter) ? t('catalog.empty_body') : t('workout.empty_body')}
            />
          ) : (
            <FlatList
              data={shown}
              keyExtractor={(exercise: CatalogExercise) => exercise.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <CatalogRow
                  exercise={item}
                  label={exerciseLabel(item, t)}
                  muscleKey={muscles.find((muscle) => muscle.id === item.primaryMuscleId)?.nameKey}
                  onEdit={() => setTarget({ kind: item.ownerUserId === null ? 'fork' : 'edit', exercise: item })}
                  onHide={() => {
                    setExerciseArchived({ userId, exerciseId: item.id, archived: true, now: Date.now() });
                    setRevision((current) => current + 1);
                  }}
                />
              )}
            />
          )}
        </>
      )}
      {target === null ? null : (
        <ExerciseForm userId={userId} target={target} onClose={() => setTarget(null)} onSaved={onSaved} />
      )}
    </Screen>
  );
}

/** Tapping the chip that is already chosen clears it — a filter you cannot undo with the control you set it with is a trap. */
function sameOrNull<T>(current: T | null, pressed: T): T | null {
  return current === pressed ? null : pressed;
}

function FilterRow({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <View style={styles.filter}>
      <AppText variant="label" tone="textSecondary">
        {label}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {children}
      </ScrollView>
    </View>
  );
}

function CatalogRow({
  exercise,
  label,
  muscleKey,
  onEdit,
  onHide,
}: {
  readonly exercise: CatalogExercise;
  readonly label: string;
  readonly muscleKey: string | undefined;
  readonly onEdit: () => void;
  readonly onHide: () => void;
}) {
  const t = useT();
  const { colors } = useTheme();

  return (
    <View style={[styles.row, { borderBottomColor: colors.borderSubtle }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('catalog.edit')}
        onPress={onEdit}
        style={styles.rowMain}
      >
        <AppText>{label}</AppText>
        <AppText variant="caption" tone="textMuted">
          {[t(`modality.${exercise.modality}`), muscleKey === undefined ? null : t(muscleKey)]
            .filter((part) => part !== null)
            .join(' · ')}
        </AppText>
      </Pressable>

      <Pressable accessibilityRole="button" accessibilityLabel={t('catalog.hide')} onPress={onHide} style={styles.hide}>
        <AppText variant="caption" tone="textSecondary">
          {t('catalog.hide')}
        </AppText>
      </Pressable>
    </View>
  );
}

/**
 * A hidden exercise, offered back — the other half of `CatalogRow`. No edit here: an archived exercise is not on
 * offer to change, only to bring back (FR-2.4).
 */
function HiddenRow({
  exercise,
  label,
  onUnhide,
}: {
  readonly exercise: CatalogExercise;
  readonly label: string;
  readonly onUnhide: () => void;
}) {
  const t = useT();
  const { colors } = useTheme();

  return (
    <View style={[styles.row, { borderBottomColor: colors.borderSubtle }]}>
      <View style={styles.rowMain}>
        <AppText>{label}</AppText>
        {exercise.ownerUserId !== null ? null : (
          <AppText variant="caption" tone="textMuted">
            {t('catalog.hidden_global_note')}
          </AppText>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('catalog.unhide')}
        onPress={onUnhide}
        style={styles.hide}
      >
        <AppText variant="caption" tone="textSecondary">
          {t('catalog.unhide')}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], padding: space[4] },
  modeRow: { paddingHorizontal: space[4] },
  hiddenNote: { paddingHorizontal: space[4], paddingBottom: space[2] },
  controls: { paddingHorizontal: space[4], gap: space[3] },
  filter: { gap: space[1] },
  chips: { gap: space[2], paddingRight: space[4] },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  list: { padding: space[4], paddingBottom: space[12] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], borderBottomWidth: sizes.edgeHairline },
  rowMain: { flex: 1, minHeight: sizes.targetMin, justifyContent: 'center', paddingVertical: space[1] },
  hide: { minHeight: sizes.targetMin, minWidth: sizes.targetMin, alignItems: 'center', justifyContent: 'center' },
});
