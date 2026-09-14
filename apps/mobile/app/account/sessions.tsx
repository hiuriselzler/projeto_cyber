import { SessionGate, SessionsScreen } from '@/features/account';

export default function Sessions() {
  return (
    <SessionGate>
      <SessionsScreen />
    </SessionGate>
  );
}
