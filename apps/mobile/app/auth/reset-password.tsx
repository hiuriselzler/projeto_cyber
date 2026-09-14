import { ResetPasswordScreen } from '@/features/account';

/** Also the target of the reset link in the email: cyberathlete://auth/reset-password?token=… */
export default function ResetPassword() {
  return <ResetPasswordScreen />;
}
