import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Chip, Sheet, space, TextField, useT } from '@/ui';

const FATIGUE_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

interface FinishSheetProps {
  readonly visible: boolean;
  readonly ticked: number;
  readonly unticked: number;
  /** 1–10 as stored, or null — "not recorded", never 0 (INV-03). */
  readonly fatigue: number | null;
  /** The workout's note as stored. */
  readonly notes: string | null;
  readonly onFatigue: (value: number | null) => void;
  readonly onNotes: (text: string) => void;
  readonly onFinish: () => void;
  readonly onDiscard: () => void;
  readonly onClose: () => void;
}

/**
 * Finishing a workout — task 004 stage 6.
 *
 * - **Perceived fatigue** is a chip row, 1 to 10, optional; tapping the chosen one again clears it. It is the user's own
 *   annotation, said so on the sheet, and it reaches nothing — not the core, not a record, not a plan (INV-03).
 * - **The note** is written as it is typed, like every field in a workout (INV-09), and kept exactly as typed (INV-27).
 *   The field keeps what was typed so a leading space is not eaten by a re-read, and it is never the only copy: every
 *   keystroke has already been written.
 * - **Unticked sets are counted, never removed** (decision 7). With nothing ticked there is nothing to finish, so the
 *   sheet offers to discard instead — and never offers both, so one tap cannot put away a real session.
 *
 * Every value here is written the moment it is chosen, so closing the sheet loses nothing either.
 */
export function FinishSheet({
  visible,
  ticked,
  unticked,
  fatigue,
  notes,
  onFatigue,
  onNotes,
  onFinish,
  onDiscard,
  onClose,
}: FinishSheetProps) {
  const t = useT();
  const [draft, setDraft] = useState(notes ?? '');

  return (
    <Sheet visible={visible} onClose={onClose} title={t('finish.title')}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <View style={styles.field}>
          {/*
           * No count at zero: "Nenhuma série foi marcada" below already says it, and the plural rule gave "0 série
           * marcada", which reads wrong in Brazilian Portuguese (task 004 stage 6 device pass).
           */}
          {ticked > 0 ? <AppText>{t('finish.ticked', { count: ticked })}</AppText> : null}
          {unticked > 0 ? (
            <AppText variant="caption" tone="textSecondary">
              {t('finish.unticked', { count: unticked })}
            </AppText>
          ) : null}
        </View>

        {ticked === 0 ? (
          <>
            <AppText tone="textSecondary">{t('finish.nothing_ticked')}</AppText>
            <Button variant="secondary" label={t('finish.discard')} onPress={onDiscard} />
          </>
        ) : (
          <>
            <View style={styles.field}>
              <AppText variant="label" tone="textSecondary">
                {t('finish.fatigue')}
              </AppText>
              <AppText variant="caption" tone="textMuted">
                {t('finish.fatigue_hint')}
              </AppText>
              <View style={styles.chips}>
                {FATIGUE_SCALE.map((value) => (
                  <Chip
                    key={value}
                    label={String(value)}
                    role="radio"
                    selected={fatigue === value}
                    accessibilityLabel={t('finish.fatigue_label', { value })}
                    onPress={() => onFatigue(fatigue === value ? null : value)}
                  />
                ))}
              </View>
            </View>

            <TextField
              label={t('finish.notes')}
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                onNotes(text);
              }}
              autoCapitalize="sentences"
            />

            <Button label={t('finish.confirm')} onPress={onFinish} />
          </>
        )}

        <Button variant="quiet" label={t('finish.keep_going')} onPress={onClose} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[4], paddingBottom: space[4] },
  field: { gap: space[1] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
