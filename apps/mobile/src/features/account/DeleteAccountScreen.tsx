import { useState } from 'react';

import { requestAccountDeletion } from '@/account';
import { AppText, Button, TextField, useT } from '@/ui';

import { AccountLayout, useSubmission } from './AccountLayout';
import { PendingDeletionNotice } from './PendingDeletionNotice';
import { useSession } from './useSession';

/**
 * Deleting the account (task 019): what goes, the seven days to change one's mind, and the password last. While a
 * deletion is pending, the same screen says so and offers to keep the account.
 */
export function DeleteAccountScreen() {
  const t = useT();
  const session = useSession();
  const [password, setPassword] = useState('');
  const submission = useSubmission();
  const pending = session.status === 'signed-in' && session.account.deletionRequestedAt !== null;

  const submit = async () => {
    await submission.run(async () => {
      await requestAccountDeletion(password);
      setPassword('');
    });
  };

  return (
    <AccountLayout title={t('account.delete.title')}>
      {pending ? (
        <PendingDeletionNotice />
      ) : (
        <>
          <AppText>{t('account.delete.what')}</AppText>
          <AppText>{t('account.delete.grace')}</AppText>
          <AppText>{t('account.delete.final')}</AppText>
          <TextField
            label={t('account.fields.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            error={submission.error}
          />
          <Button
            label={t('account.delete.submit')}
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
