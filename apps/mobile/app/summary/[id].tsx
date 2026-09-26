import { useLocalSearchParams } from 'expo-router';

import { SessionGate } from '@/features/account';
import { WorkoutSummaryScreen } from '@/features/strength';

/** What a finished workout came to (task 004 stage 6). Thin, like every route: it reads its parameter and composes a feature. */
export default function Summary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SessionGate>
      <WorkoutSummaryScreen workoutId={id} />
    </SessionGate>
  );
}
