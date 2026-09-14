import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { confirmPasswordReset, requestPasswordReset } from '@/account';
import { AppText, Button, TextField, useT } from '@/ui';

import { AccountLayout, useSubmission } from './AccountLayout';

/** Without a token, asks for a reset link; opened from that link, sets the new password (04 §2a). */
export function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  return typeof token === 'string' && token !== '' ? <ConfirmReset token={token} /> : <RequestReset />;
}

function RequestReset() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const submission = useSubmission();

  const submit = async () => {
    const address = email.trim();
    if (await submission.run(() => requestPasswordReset(address))) {
      setSentTo(address);
    }
  };

  return (
    <AccountLayout title={t('account.reset.title')}>
      {sentTo === null ? (
        <>
          <TextField
            label={t('account.fields.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            error={submission.error}
          />
          <Button
            label={t('account.reset.request_submit')}
            busy={submission.busy}
            disabled={email.trim() === ''}
            onPress={() => void submit()}
          />
        </>
      ) : (
        <AppText accessibilityLiveRegion="polite">{t('account.reset.request_sent', { email: sentTo })}</AppText>
      )}
    </AccountLayout>
  );
}

/** The warning comes before the button that commits, and the button says what it removes. */
function ConfirmReset({ token }: { readonly token: string }) {
  const t = useT();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const submission = useSubmission();

  const submit = async () => {
    if (await submission.run(() => confirmPasswordReset({ token, newPassword: password }))) {
      setDone(true);
    }
  };

  return (
    <AccountLayout title={t('account.reset.title')}>
      {done ? (
        <>
          <AppText accessibilityLiveRegion="polite">{t('account.reset.done')}</AppText>
          <Button label={t('account.reset.to_sign_in')} onPress={() => router.replace('/auth/sign-in')} />
        </>
      ) : (
        <>
          <AppText tone="warning">{t('account.reset.zones_warning')}</AppText>
          <TextField
            label={t('account.fields.new_password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            hint={t('account.register.password_hint')}
            error={submission.error}
          />
          <Button
            label={t('account.reset.confirm_submit')}
            busy={submission.busy}
            busyLabel={t('account.working')}
            disabled={password === ''}
            onPress={() => void submit()}
          />
        </>
      )}
    </AccountLayout>
  );
}
