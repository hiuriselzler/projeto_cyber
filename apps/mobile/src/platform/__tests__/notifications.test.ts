/**
 * The rest notification's foreground handler — task 004 stage 5 device pass, 2026-09-23.
 *
 * The first version returned "show nothing" unconditionally, believing the handler is consulted only while the app is
 * on screen. It is consulted whenever the process is alive, so a rest ending with the screen off reached it and was
 * discarded — the one delivery the notification exists for. Every gate was green; the phone found it.
 */
import { AppState } from 'react-native';

type Handler = { handleNotification: () => Promise<Record<string, boolean>> };

const mockHandlers: Handler[] = [];

jest.mock('expo-notifications', () => ({
  setNotificationHandler: (handler: Handler) => mockHandlers.push(handler),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

function registeredHandler(): Handler {
  jest.isolateModules(() => {
    // A fresh import per test, so the handler registered is the one this module's load registers.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../notifications');
  });
  const handler = mockHandlers.at(-1);
  if (handler === undefined) throw new Error('src/platform/notifications registered no handler');
  return handler;
}

function withAppState(state: string) {
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
}

describe('the rest notification while the app is alive', () => {
  it('is shown when the app is not on screen — a phone in a pocket, its screen off', async () => {
    withAppState('background');
    const shown = await registeredHandler().handleNotification();
    expect(shown).toMatchObject({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true });
  });

  it('is held back while the app is on screen, where the timer bar and the haptic already say it', async () => {
    withAppState('active');
    const shown = await registeredHandler().handleNotification();
    expect(shown).toMatchObject({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false });
  });
});
