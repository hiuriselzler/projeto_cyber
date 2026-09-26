import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  createUserExercise,
  forkDraft,
  forkGlobal,
  listMuscleGroups,
  listUserExerciseNames,
  MODALITIES,
  TRACKING,
  updateUserExercise,
  validateExerciseName,
  type CatalogExercise,
  type ExerciseDraft,
  type Modality,
  type Tracking,
} from '@/db/catalog';
import { AppText, Button, Chip, Sheet, space, TextField, useT } from '@/ui';

import { exerciseLabel } from './exerciseName';

/**
 * All four of FR-2.3's tracking modes *(since task 004 stage 5c)*. Stage 4 offered only the two the set row could log,
 * rather than let someone build an exercise the app could not; 5c gave the row a time and a distance, and the
 * deferral ended with it.
 */
const OFFERED_TRACKING: readonly Tracking[] = TRACKING;

export type FormTarget =
  | { readonly kind: 'new' }
  | { readonly kind: 'edit'; readonly exercise: CatalogExercise }
  /** A seeded global the user asked to edit. Saving forks it; the global itself is never written. */
  | { readonly kind: 'fork'; readonly exercise: CatalogExercise };

interface ExerciseFormProps {
  readonly userId: string;
  readonly target: FormTarget;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

/**
 * Create an exercise, edit one of the user's own, or fork a global into a copy they own (FR-2.2).
 *
 * **What a fork is named, settled in the task file and honoured here:** the name copied in is the one in *the UI
 * language at the moment of forking* — what the user was looking at when they chose to edit — and from then on it is
 * user content, shown exactly as stored and never re-translated (INV-27). `exerciseLabel` is what resolves it, so the
 * form never has to know which language that was.
 *
 * A name that collides with one of the user's own live exercises is **an error on the field they are editing**, never
 * an auto-suffix. `(2)` is a name nobody typed.
 */
export function ExerciseForm({ userId, target, onClose, onSaved }: ExerciseFormProps) {
  const t = useT();
  const muscles = useMemo(() => listMuscleGroups(), []);

  const [draft, setDraft] = useState<ExerciseDraft>(() => initialDraft(target, muscles[0]?.id ?? 1, t));
  const [problem, setProblem] = useState<ReturnType<typeof validateExerciseName>>(null);

  const editingId = target.kind === 'edit' ? target.exercise.id : undefined;
  const title = target.kind === 'new' ? t('catalog.form_new_title') : t('catalog.form_edit_title');

  const save = () => {
    // Read the taken names at save time, not at mount: the form may have been open while something else changed.
    const found = validateExerciseName(draft.name, listUserExerciseNames(userId, editingId));
    if (found !== null) {
      setProblem(found);
      return;
    }

    const now = Date.now();
    if (target.kind === 'edit') {
      updateUserExercise({ userId, exerciseId: target.exercise.id, draft, now });
    } else if (target.kind === 'fork') {
      void forkGlobal({ userId, globalId: target.exercise.id, draft, now }).then(onSaved);
      return;
    } else {
      void createUserExercise({ userId, draft, now }).then(onSaved);
      return;
    }
    onSaved();
  };

  return (
    <Sheet visible onClose={onClose} title={title}>
      <ScrollView contentContainerStyle={styles.body}>
        {target.kind !== 'fork' ? null : (
          <AppText variant="caption" tone="textSecondary">
            {t('catalog.fork_note')}
          </AppText>
        )}

        <TextField
          label={t('catalog.field_name')}
          value={draft.name}
          onChangeText={(name) => {
            setDraft((current) => ({ ...current, name }));
            setProblem(null);
          }}
          error={problem === null ? undefined : t(`catalog.name_${problem}`)}
        />

        <Field label={t('catalog.field_modality')}>
          {MODALITIES.map((modality) => (
            <Chip
              key={modality}
              label={t(`modality.${modality}`)}
              role="radio"
              selected={draft.modality === modality}
              onPress={() => setDraft((current) => ({ ...current, modality }))}
            />
          ))}
        </Field>

        <Field label={t('catalog.field_muscle')}>
          {muscles.map((muscle) => (
            <Chip
              key={muscle.id}
              label={t(muscle.nameKey)}
              role="radio"
              selected={draft.primaryMuscleId === muscle.id}
              onPress={() => setDraft((current) => ({ ...current, primaryMuscleId: muscle.id }))}
            />
          ))}
        </Field>

        <Field label={t('catalog.field_tracking')}>
          {OFFERED_TRACKING.map((tracking) => (
            <Chip
              key={tracking}
              label={t(`tracking.${tracking}`)}
              role="radio"
              selected={draft.tracking === tracking}
              onPress={() => setDraft((current) => ({ ...current, tracking }))}
            />
          ))}
        </Field>

        <Field label={t('catalog.field_bodyweight')} hint={t('catalog.field_bodyweight_hint')}>
          <Chip
            label={t('catalog.field_bodyweight')}
            role="checkbox"
            selected={draft.usesBodyweight}
            onPress={() => setDraft((current) => ({ ...current, usesBodyweight: !current.usesBodyweight }))}
          />
          <Chip
            label={t('catalog.field_unilateral')}
            role="checkbox"
            selected={draft.isUnilateral}
            onPress={() => setDraft((current) => ({ ...current, isUnilateral: !current.isUnilateral }))}
          />
        </Field>

        <View style={styles.actions}>
          <Button variant="secondary" label={t('catalog.cancel')} onPress={onClose} />
          <Button label={t('catalog.save')} onPress={save} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

function initialDraft(target: FormTarget, fallbackMuscleId: number, t: (key: string) => string): ExerciseDraft {
  if (target.kind === 'new') {
    return {
      name: '',
      modality: 'barbell' satisfies Modality,
      primaryMuscleId: fallbackMuscleId,
      tracking: 'weight_reps',
      isUnilateral: false,
      usesBodyweight: false,
      loadIncrementKg: null,
      notes: null,
    };
  }
  // Both edit and fork start from the row's own values; only the name differs, and only because a global has none of
  // its own — `exerciseLabel` resolves the key in the language currently on screen (INV-27, ADR-008).
  return forkDraft(target.exercise, exerciseLabel(target.exercise, t));
}

function Field({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <AppText variant="label" tone="textSecondary">
        {label}
      </AppText>
      {hint === undefined ? null : (
        <AppText variant="caption" tone="textMuted">
          {hint}
        </AppText>
      )}
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[3], paddingBottom: space[4] },
  field: { gap: space[1] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space[2] },
});
