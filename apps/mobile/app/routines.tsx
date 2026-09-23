import { SessionGate } from '@/features/account';
import { RoutinesScreen } from '@/features/strength';

/** The user's routines. Thin, like every route: it composes a feature and nothing else. */
export default function Routines() {
  return (
    <SessionGate>
      <RoutinesScreen />
    </SessionGate>
  );
}
