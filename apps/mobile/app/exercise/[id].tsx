import { useLocalSearchParams } from 'expo-router';

import { SessionGate } from '@/features/account';
import { ExerciseHistoryScreen } from '@/features/strength';

/** One exercise's history and charts (task 004 stage 7). Thin: it reads its parameter and composes a feature. */
export default function ExerciseHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SessionGate>
      <ExerciseHistoryScreen exerciseId={id} />
    </SessionGate>
  );
}
