import { ChangeEmailScreen, SessionGate } from '@/features/account';

export default function Email() {
  return (
    <SessionGate>
      <ChangeEmailScreen />
    </SessionGate>
  );
}
