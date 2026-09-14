import { ChangePasswordScreen, SessionGate } from '@/features/account';

export default function Password() {
  return (
    <SessionGate>
      <ChangePasswordScreen />
    </SessionGate>
  );
}
