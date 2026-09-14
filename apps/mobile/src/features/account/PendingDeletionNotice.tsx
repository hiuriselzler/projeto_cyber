import { StyleSheet, View } from 'react-native';

import { cancelAccountDeletion } from '@/account';
import { AppText, Button, formatCalendarDay, space, useLocale, useT } from '@/ui';

import { useSubmission } from './AccountLayout';
import { useSession } from './useSession';

/** A pending deletion, said plainly, with the way to keep the account (task 019). Nothing when none is pending. */
export function PendingDeletionNotice() {
  const t = useT();
  const { locale } = useLocale();
  const session = useSession();
  const submission = useSubmission();

  if (session.status !== 'signed-in' || session.account.deletionRequestedAt === null) {
    return null;
  }
  const date = formatCalendarDay(session.account.deletionRequestedAt, locale);

  const keep = async () => {
    await submission.run(async () => {
      await cancelAccountDeletion();
    });
  };

  return (
    <View style={styles.notice}>
      <AppText accessibilityLiveRegion="polite">{t('account.delete.pending', { date })}</AppText>
      {submission.error === undefined ? null : (
        <AppText tone="danger" accessibilityLiveRegion="polite">
          {submission.error}
        </AppText>
      )}
      <Button
        variant="secondary"
        label={t('account.delete.cancel')}
        busy={submission.busy}
        busyLabel={t('account.working')}
        onPress={() => void keep()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { gap: space[2] },
});
