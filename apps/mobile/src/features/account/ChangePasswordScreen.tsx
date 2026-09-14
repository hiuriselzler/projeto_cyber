import { useState } from 'react';

import { changePassword } from '@/account';
import { AppText, Button, TextField, useT } from '@/ui';

import { AccountLayout, useSubmission } from './AccountLayout';

/** Re-wraps the privacy key under the new password; zones survive and every other device stays signed in. */
export function ChangePasswordScreen() {
  const t = useT();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [done, setDone] = useState(false);
  const submission = useSubmission();

  const submit = async () => {
    if (await submission.run(() => changePassword({ currentPassword, newPassword }))) {
      setDone(true);
    }
  };

  return (
    <AccountLayout title={t('account.password.title')}>
      {done ? (
        <AppText accessibilityLiveRegion="polite">{t('account.password.done')}</AppText>
      ) : (
        <>
          <TextField
            label={t('account.fields.current_password')}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
          />
          <TextField
            label={t('account.fields.new_password')}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            hint={t('account.register.password_hint')}
            error={submission.error}
          />
          <Button
            label={t('account.password.submit')}
            busy={submission.busy}
            busyLabel={t('account.working')}
            disabled={currentPassword === '' || newPassword === ''}
            onPress={() => void submit()}
          />
        </>
      )}
    </AccountLayout>
  );
}
