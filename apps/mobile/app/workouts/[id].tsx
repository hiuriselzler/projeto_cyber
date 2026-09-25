import { useLocalSearchParams } from 'expo-router';

import { SessionGate } from '@/features/account';
import { WorkoutDetailScreen } from '@/features/strength';

/** One finished workout, every set as logged (task 004 stage 7). Thin: it reads its parameter and composes a feature. */
export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SessionGate>
      <WorkoutDetailScreen workoutId={id} />
    </SessionGate>
  );
}
