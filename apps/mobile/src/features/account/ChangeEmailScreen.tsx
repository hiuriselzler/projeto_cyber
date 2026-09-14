import { useState } from 'react';

import { changeEmail } from '@/account';
import { AppText, Button, TextField, useT } from '@/ui';

import { AccountLayout, useSubmission } from './AccountLayout';

/** Nothing changes until the link sent to the new address is opened (04 §2a). */
export function ChangeEmailScreen() {
  const t = useT();
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const submission = useSubmission();

  const submit = async () => {
    const address = newEmail.trim();
    if (await submission.run(() => changeEmail({ currentPassword, newEmail: address }))) {
      setSentTo(address);
    }
  };

  return (
    <AccountLayout title={t('account.email.title')}>
      {sentTo !== null ? (
        <AppText accessibilityLiveRegion="polite">{t('account.email.sent', { email: sentTo })}</AppText>
      ) : (
        <>
          <TextField
            label={t('account.fields.new_email')}
            value={newEmail}
            onChangeText={setNewEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextField
            label={t('account.fields.current_password')}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            error={submission.error}
          />
          <Button
            label={t('account.email.submit')}
            busy={submission.busy}
            disabled={newEmail.trim() === '' || currentPassword === ''}
            onPress={() => void submit()}
          />
        </>
      )}
    </AccountLayout>
  );
}
