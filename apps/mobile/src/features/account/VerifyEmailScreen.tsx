import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AccountError, verifyEmail } from '@/account';
import { AppText, Button, useT } from '@/ui';

import { AccountLayout } from './AccountLayout';

/** Opened from the link in a verification email. Confirms once, and never retries a used link. */
export function VerifyEmailScreen() {
  const t = useT();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const verification = useQuery({
    queryKey: ['account', 'verify-email', token],
    queryFn: async () => {
      await verifyEmail(typeof token === 'string' ? token : '');
      return true;
    },
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const failure = verification.error instanceof AccountError ? verification.error.code : 'unknown';

  return (
    <AccountLayout title={t('account.verify.title')}>
      <AppText accessibilityLiveRegion="polite">
        {verification.isPending
          ? t('account.verify.working')
          : verification.isError
            ? t(`account.errors.${failure}`)
            : t('account.verify.done')}
      </AppText>
      {verification.isPending ? null : (
        <Button label={t('account.verify.continue')} onPress={() => router.replace('/')} />
      )}
    </AccountLayout>
  );
}
