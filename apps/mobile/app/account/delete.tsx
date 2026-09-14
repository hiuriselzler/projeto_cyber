import { DeleteAccountScreen, SessionGate } from '@/features/account';

export default function DeleteAccount() {
  return (
    <SessionGate>
      <DeleteAccountScreen />
    </SessionGate>
  );
}
