import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { listSessions, revokeSession, signOut, signOutEverywhere } from '@/account';
import { AppText, Button, space, useT } from '@/ui';

import { AccountLayout, useSubmission } from './AccountLayout';

/** The devices signed in to this account; any other can be signed out from here (04 §2a). */
export function SessionsScreen() {
  const t = useT();
  const router = useRouter();
  const sessions = useQuery({ queryKey: ['account', 'sessions'], queryFn: listSessions });
  const submission = useSubmission();

  const revoke = async (sessionId: string) => {
    if (await submission.run(() => revokeSession(sessionId))) {
      await sessions.refetch();
    }
  };
  const leave = async (action: () => Promise<void>) => {
    if (await submission.run(action)) {
      router.replace('/auth/sign-in');
    }
  };

  return (
    <AccountLayout title={t('account.sessions.title')}>
      {(sessions.data ?? []).map((session) => (
        <View key={session.id} style={styles.session}>
          <AppText>{session.deviceName ?? t('account.sessions.unnamed_device')}</AppText>
          {session.current ? (
            <AppText variant="caption" tone="textSecondary">
              {t('account.sessions.this_device')}
            </AppText>
          ) : (
            <Button
              variant="secondary"
              label={t('account.sessions.sign_out_device')}
              disabled={submission.busy}
              onPress={() => void revoke(session.id)}
            />
          )}
        </View>
      ))}
      {submission.error === undefined ? null : (
        <AppText tone="danger" accessibilityLiveRegion="polite">
          {submission.error}
        </AppText>
      )}
      <Button variant="secondary" label={t('account.sessions.sign_out')} onPress={() => void leave(signOut)} />
      <Button
        variant="secondary"
        label={t('account.sessions.sign_out_everywhere')}
        onPress={() => void leave(signOutEverywhere)}
      />
    </AccountLayout>
  );
}

const styles = StyleSheet.create({
  session: { gap: space[2] },
});
