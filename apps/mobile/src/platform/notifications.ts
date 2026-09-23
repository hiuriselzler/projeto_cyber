/**
 * Local notifications, behind an interface the rest of the app calls without knowing which OS answers (INV-28,
 * ADR-009). Today that is one: the rest timer's end (task 004 stage 5b). **Local only** — no push server, no device
 * token, nothing to leak ([05 §3](../../../../docs/05-integrations.md)).
 *
 * What is Android's here, and why it lives in this folder: a notification needs a *channel*, which the user sees by
 * name in the system settings, and Android 13+ asks a runtime permission before any notification shows. Neither exists
 * the same way on iOS, which is exactly the kind of difference the rest of the app must never branch on.
 *
 * Every call is a courtesy, like the haptic. None throws: a phone that refuses notifications still runs the timer on
 * screen, with its haptic, and a failure here is never allowed to reach a workout.
 */
import * as Notifications from 'expo-notifications';

/** One rest notification at a time: scheduling again under the same identifier replaces the last one. */
const REST_IDENTIFIER = 'rest-timer';
const REST_CHANNEL = 'rest-timer';

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

/**
 * While the app is in front, a rest ending is felt as a haptic and seen on the timer bar — a banner on top of that
 * would be the same news twice. The notification is for the phone in a pocket.
 */
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
});

/**
 * Create (or rename) the channel rest notifications arrive on. The name is shown in the system's notification
 * settings, so the caller passes it already translated (INV-27) — this folder adapts, it does not decide what to say.
 */
export async function prepareRestAlerts(channelName: string): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(REST_CHANNEL, {
      name: channelName,
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    });
  } catch {
    // No channel means no notification; the timer on screen is unaffected.
  }
}

/** Whether notifications may be shown, without asking. */
export async function notificationPermission(): Promise<NotificationPermission> {
  try {
    const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
    if (granted) return 'granted';
    return canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * Ask — **only if the question is still open.** A user who refused is never asked again (task 004 § Stages,
 * decision 6): the OS says so through `canAskAgain`, so no flag of the app's own is needed to keep that promise.
 */
export async function askForNotifications(): Promise<NotificationPermission> {
  const current = await notificationPermission();
  if (current !== 'undetermined') return current;
  try {
    const { granted } = await Notifications.requestPermissionsAsync();
    return granted ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * Tell the user their rest is over at `atEpochMs`, replacing any rest notification already scheduled. Text arrives
 * translated from the caller (INV-27).
 */
export async function scheduleRestEnd(input: {
  readonly atEpochMs: number;
  readonly title: string;
  readonly body: string;
}): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: REST_IDENTIFIER,
      content: { title: input.title, body: input.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: input.atEpochMs, channelId: REST_CHANNEL },
    });
  } catch {
    // Not delivered is the worst case, and the timer bar still counts down.
  }
}

/** Take back a scheduled rest notification — and one already showing, so a skipped rest leaves nothing behind. */
export async function cancelRestEnd(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REST_IDENTIFIER);
    await Notifications.dismissNotificationAsync(REST_IDENTIFIER);
  } catch {
    // Nothing was scheduled, or the OS already cleared it.
  }
}
