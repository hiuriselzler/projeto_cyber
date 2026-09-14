import { useRouter } from 'expo-router';
import { useState } from 'react';

import { signIn } from '@/account';
import { Button, TextField, useT } from '@/ui';

import { AccountLayout, useSubmission } from './AccountLayout';

export function SignInScreen() {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submission = useSubmission();

  const submit = async () => {
    if (await submission.run(() => signIn({ email: email.trim(), password }).then(() => undefined))) {
      router.replace('/');
    }
  };

  return (
    <AccountLayout title={t('account.sign_in.title')}>
      <TextField
        label={t('account.fields.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
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
        label={t('account.sign_in.submit')}
        busy={submission.busy}
        busyLabel={t('account.working')}
        disabled={email.trim() === '' || password === ''}
        onPress={() => void submit()}
      />
      <Button variant="quiet" label={t('account.sign_in.to_register')} onPress={() => router.push('/auth/register')} />
      <Button variant="quiet" label={t('account.sign_in.to_reset')} onPress={() => router.push('/auth/reset-password')} />
    </AccountLayout>
  );
}
