import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { createRoutine, routineNameProblem, updateRoutine } from '@/db/routines';
import { Button, Sheet, space, TextField, useT } from '@/ui';

export type RoutineFormTarget =
  | { readonly kind: 'new' }
  | { readonly kind: 'edit'; readonly routineId: string; readonly name: string; readonly folder: string | null };

interface RoutineFormProps {
  readonly userId: string;
  readonly target: RoutineFormTarget;
  readonly onClose: () => void;
  /** Called with the routine's id once it is written — a new one's, so the caller can open it straight away. */
  readonly onSaved: (routineId: string) => void;
}

/**
 * A routine's name and folder — creating one, or renaming and refiling it.
 *
 * Both are user content, stored exactly as typed and never translated (INV-27). A folder is a label, not a record:
 * typing the same text into two routines is what files them together, and leaving it blank files a routine nowhere.
 */
export function RoutineForm({ userId, target, onClose, onSaved }: RoutineFormProps) {
  const t = useT();
  const [name, setName] = useState(target.kind === 'edit' ? target.name : '');
  const [folder, setFolder] = useState(target.kind === 'edit' ? (target.folder ?? '') : '');
  const [problem, setProblem] = useState<'empty' | null>(null);

  const save = () => {
    const found = routineNameProblem(name);
    if (found !== null) {
      setProblem(found);
      return;
    }
    const now = Date.now();
    if (target.kind === 'edit') {
      updateRoutine({ userId, routineId: target.routineId, name, folder, now });
      onSaved(target.routineId);
      return;
    }
    void createRoutine({ userId, name, folder, now }).then(onSaved);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={target.kind === 'new' ? t('routine.form_new_title') : t('routine.form_edit_title')}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextField
          label={t('routine.field_name')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setProblem(null);
          }}
          error={problem === null ? undefined : t(`routine.name_${problem}`)}
        />
        <TextField
          label={t('routine.field_folder')}
          hint={t('routine.field_folder_hint')}
          value={folder}
          onChangeText={setFolder}
        />
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
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space[2] },
});
