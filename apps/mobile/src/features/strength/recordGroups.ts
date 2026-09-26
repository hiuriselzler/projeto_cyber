import { readExercise } from '@/db/catalog';
import { formatWeight, type Locale, type RecordGroup, type RecordLine, type UnitSystem, type useT } from '@/ui';

import { exerciseLabel } from './exerciseName';
import { isWeightRecord, RECORD_KIND_KEY, type ExerciseRecord } from './finish';

/**
 * Records in words, one group per exercise in workout order, each group's records in the core's order — in the user's
 * unit system and locale (INV-01), each exercise named as INV-27 says. Shared by the finish summary (stage 6) and a
 * workout's detail (stage 7), so the two can never word the same record differently.
 */
export function recordGroups(
  records: readonly ExerciseRecord[],
  userId: string,
  t: ReturnType<typeof useT>,
  unitSystem: UnitSystem,
  locale: Locale,
): RecordGroup[] {
  const weight = (kilograms: number) => {
    const quantity = formatWeight(kilograms, unitSystem, locale);
    return t('summary.quantity', { value: quantity.text, unit: t(`unit.${quantity.unit}`) });
  };
  const groups = new Map<string, RecordLine[]>();
  records.forEach(({ exerciseId, record }, at) => {
    const line: RecordLine = {
      key: `${record.kind}:${String(at)}`,
      kind: t(RECORD_KIND_KEY[record.kind], { weight: record.weightKg === null ? '' : weight(record.weightKg) }),
      value: isWeightRecord(record.kind) ? weight(record.value) : t('summary.reps', { count: record.value }),
    };
    const lines = groups.get(exerciseId);
    if (lines === undefined) groups.set(exerciseId, [line]);
    else lines.push(line);
  });
  return [...groups.entries()].map(([exerciseId, lines]) => {
    const catalog = readExercise(userId, exerciseId);
    return { key: exerciseId, subject: catalog === null ? '' : exerciseLabel(catalog, t), records: lines };
  });
}
