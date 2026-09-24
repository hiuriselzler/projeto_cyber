import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { RoutineTargets, TargetProblem } from '@/db/routines';
import { AppText, Button, Chip, formatDuration, RirChips, Sheet, space, TextField, useT } from '@/ui';

import { draftFromTargets, restChoices, targetsFromDraft, type TargetsDraft } from './targetsDraft';

interface TargetsSheetProps {
  /** The exercise's name as the screen shows it — already resolved, translated or as typed (INV-27). */
  readonly title: string;
  readonly targets: RoutineTargets;
  /**
   * Whether the exercise is counted in reps. A rep range and a target RIR mean nothing for a plank or a carry, so the
   * sheet does not offer them (task 004 § Stages, 5c decision 5); sets and rest still apply to every mode.
   */
  readonly countsReps?: boolean;
  readonly onClose: () => void;
  readonly onSave: (targets: RoutineTargets) => void;
}

/**
 * One routine exercise's targets: sets, a rep range, a target RIR and a rest (FR-2.5).
 *
 * Every field may stay blank, and blank means "not set" — never 0, never a default the app picked. RIR is the same chip
 * row the set row uses, never a keyboard (FR-2.10), and the note under it says what the target is *for*: it is shown
 * beside each set and never logged on the user's behalf (INV-03, task 004 § Stages, decision 3).
 */
export function TargetsSheet({ title, targets, countsReps = true, onClose, onSave }: TargetsSheetProps) {
  const t = useT();
  const [draft, setDraft] = useState<TargetsDraft>(() => draftFromTargets(targets));
  const [problem, setProblem] = useState<TargetProblem | null>(null);

  const edit = (patch: Partial<TargetsDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setProblem(null);
  };

  const save = () => {
    const result = targetsFromDraft(draft);
    if ('problem' in result) {
      setProblem(result.problem);
      return;
    }
    // Fields the sheet does not show are not kept either: a rep range left over on a plank would be a target nobody set.
    onSave(countsReps ? result.targets : { ...result.targets, targetMinReps: null, targetMaxReps: null, targetRir: null });
  };

  const message = problem === null ? undefined : t(`routine.problem_${problem}`);

  return (
    <Sheet visible onClose={onClose} title={title}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextField
          label={t('routine.field_sets')}
          value={draft.sets}
          onChangeText={(sets) => edit({ sets })}
          keyboardType="number-pad"
          error={problem === 'sets' ? message : undefined}
        />
        {countsReps ? (
          <View style={styles.pair}>
            <View style={styles.half}>
              <TextField
                label={t('routine.field_min_reps')}
                value={draft.minReps}
                onChangeText={(minReps) => edit({ minReps })}
                keyboardType="number-pad"
                error={problem === 'reps' || problem === 'rep_range' ? message : undefined}
              />
            </View>
            <View style={styles.half}>
              <TextField
                label={t('routine.field_max_reps')}
                value={draft.maxReps}
                onChangeText={(maxReps) => edit({ maxReps })}
                keyboardType="number-pad"
              />
            </View>
          </View>
        ) : null}

        {countsReps ? (
          <View style={styles.field}>
            <AppText variant="label" tone="textSecondary">
              {t('routine.field_rir')}
            </AppText>
            <AppText variant="caption" tone="textMuted">
              {t('routine.field_rir_hint')}
            </AppText>
            <RirChips value={draft.rir} onChange={(rir) => edit({ rir })} />
          </View>
        ) : null}

        <View style={styles.field}>
          <AppText variant="label" tone="textSecondary">
            {t('routine.field_rest')}
          </AppText>
          <AppText variant="caption" tone="textMuted">
            {t('routine.field_rest_hint')}
          </AppText>
          <View style={styles.chips}>
            <Chip
              label={t('routine.rest_off')}
              role="radio"
              selected={draft.restSeconds === null}
              onPress={() => edit({ restSeconds: null })}
            />
            {restChoices(draft.restSeconds).map((seconds) => (
              <Chip
                key={seconds}
                label={formatDuration(seconds)}
                role="radio"
                selected={draft.restSeconds === seconds}
                onPress={() => edit({ restSeconds: seconds })}
              />
            ))}
          </View>
          {problem === 'rest' || problem === 'rir' ? (
            <AppText variant="caption" tone="danger">
              {message}
            </AppText>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Button variant="secondary" label={t('routine.cancel')} onPress={onClose} />
          <Button label={t('routine.save')} onPress={save} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[3], paddingBottom: space[4] },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  half: { flexGrow: 1, flexBasis: 0, minWidth: space[12] * 2 },
  field: { gap: space[1] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space[2] },
});
