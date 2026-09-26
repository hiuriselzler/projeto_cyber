import { SessionGate } from '@/features/account';
import { WorkoutHistoryScreen } from '@/features/strength';

/** The user's finished workouts (task 004 stage 7). Thin, like every route: it composes a feature and nothing else. */
export default function History() {
  return (
    <SessionGate>
      <WorkoutHistoryScreen />
    </SessionGate>
  );
}
