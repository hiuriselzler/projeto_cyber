import { useRouter } from 'expo-router';
import { useState } from 'react';

import { register } from '@/account';
import { Button, TextField, useLocale, useT } from '@/ui';

import { AccountLayout, useSubmission } from './AccountLayout';

/** Language and units start from the device (ADR-008) and are the account's from then on. */
export function RegisterScreen() {
  const t = useT();
  const router = useRouter();
  const { locale, unitSystem } = useLocale();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submission = useSubmission();

  const submit = async () => {
    const created = await submission.run(() =>
      register({ email: email.trim(), password, displayName: displayName.trim(), locale, unitSystem }).then(() => undefined),
    );
    if (created) {
      router.replace('/');
    }
  };

  return (
    <AccountLayout title={t('account.register.title')}>
      <TextField
        label={t('account.fields.display_name')}
        value={displayName}
        onChangeText={setDisplayName}
        autoComplete="name"
        textContentType="name"
      />
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
        autoComplete="new-password"
        textContentType="newPassword"
        hint={t('account.register.password_hint')}
        error={submission.error}
      />
      <Button
        label={t('account.register.submit')}
        busy={submission.busy}
        busyLabel={t('account.working')}
        disabled={displayName.trim() === '' || email.trim() === '' || password === ''}
        onPress={() => void submit()}
      />
      <Button variant="quiet" label={t('account.register.to_sign_in')} onPress={() => router.replace('/auth/sign-in')} />
    </AccountLayout>
  );
}
