import { StyleSheet, View } from 'react-native';

import type { Tracking } from '@/db/catalog';
import type { PerformedSet } from '@/db/history';
import { AppText, space, useLocale, useT } from '@/ui';

import { setLine } from './history';

/**
 * One set as logged, in a history (task 004 stage 7): its number — or its type's letter, with the type in words, so
 * the type is never a letter or a colour alone (INV-24) — then the line, and "not ticked" on a row that counted for
 * nothing. The log shows every row; only the totals leave some out (INV-04).
 */
export function LoggedSetLine({ set, tracking }: { readonly set: PerformedSet; readonly tracking: Tracking }) {
  const t = useT();
  const { locale, unitSystem } = useLocale();
  const working = set.setType === 'working';
  return (
    <View accessible style={styles.set}>
      <AppText variant="label" tone="textSecondary" style={styles.number}>
        {working ? String(set.setIndex) : t(`ui.set_row.type_letter.${set.setType}`)}
      </AppText>
      <View style={styles.body}>
        <AppText>{setLine(set, tracking, t, unitSystem, locale)}</AppText>
        {working && set.isCompleted ? null : (
          <View style={styles.marks}>
            {working ? null : (
              <AppText variant="caption" tone="textMuted">
                {t(`set_type.${set.setType}`)}
              </AppText>
            )}
            {set.isCompleted ? null : (
              <AppText variant="caption" tone="textMuted">
                {t('history.not_ticked')}
              </AppText>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  set: { flexDirection: 'row', gap: space[3], alignItems: 'baseline' },
  number: { minWidth: space[6] },
  body: { flex: 1, gap: space[1] },
  marks: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
