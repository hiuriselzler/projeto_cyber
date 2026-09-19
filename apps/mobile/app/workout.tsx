import { SessionGate } from '@/features/account';
import { LiveWorkoutScreen } from '@/features/strength';

/** The live workout. Thin, like every route: it composes a feature and nothing else. */
export default function Workout() {
  return (
    <SessionGate>
      <LiveWorkoutScreen />
    </SessionGate>
  );
}
