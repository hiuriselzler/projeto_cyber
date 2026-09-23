import { useLocalSearchParams } from 'expo-router';

import { SessionGate } from '@/features/account';
import { RoutineEditor } from '@/features/strength';

/** One routine, edited. Thin, like every route: it reads its parameter and composes a feature. */
export default function Routine() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SessionGate>
      <RoutineEditor routineId={id} />
    </SessionGate>
  );
}
