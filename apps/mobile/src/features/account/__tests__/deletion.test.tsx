/**
 * Deleting the account, in both languages (task 019, INV-27). The flows are mocked; they are tested in src/account.
 */
import en from '@cyberathlete/shared/i18n/en.json';
import ptBR from '@cyberathlete/shared/i18n/pt-BR.json';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { setSessionState } from '@/account/session';
import type { LocalAccount } from '@/db/account';

import { MATRIX, renderUi } from '../../../../test/render';
import { DeleteAccountScreen } from '../DeleteAccountScreen';

jest.mock('@/account', () => ({
  ...jest.requireActual('@/account/errors'),
  ...jest.requireActual('@/account/session'),
  requestAccountDeletion: jest.fn(),
  cancelAccountDeletion: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  Redirect: () => null,
}));

const account = jest.requireMock('@/account') as {
  requestAccountDeletion: jest.Mock;
  cancelAccountDeletion: jest.Mock;
};

const CATALOGS = { en: en.account, 'pt-BR': ptBR.account } as const;
const LANGUAGES = MATRIX.filter((setting) => setting.unitSystem === 'metric' && setting.preference === 'dark');

const ANA: LocalAccount = {
  id: '0192f0c4-0000-7000-8000-000000000001',
  email: 'ana@example.com',
  emailVerified: false,
  displayName: 'Ana',
  unitSystem: 'metric',
  locale: 'en',
  timezone: 'America/Sao_Paulo',
  deletionRequestedAt: null,
};
// Built in the device's own time zone, so the day shown is the same wherever the test runs.
const REQUESTED_AT = new Date(2026, 8, 14, 12).getTime();

describe.each(LANGUAGES)('$locale', (setting) => {
  const words = CATALOGS[setting.locale];

  beforeEach(() => {
    jest.clearAllMocks();
    setSessionState({ status: 'signed-in', account: ANA });
  });

  it('says what is deleted and that it can be cancelled for 7 days, then takes the password', async () => {
    account.requestAccountDeletion.mockImplementationOnce(async () => {
      const pending = { ...ANA, deletionRequestedAt: REQUESTED_AT };
      setSessionState({ status: 'signed-in', account: pending });
      return pending;
    });
    await renderUi(<DeleteAccountScreen />, setting);

    expect(screen.getByText(words.delete.what)).toBeOnTheScreen();
    expect(screen.getByText(words.delete.grace)).toBeOnTheScreen();
    expect(screen.getByText(words.delete.final)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText(words.fields.password), 'plum-orbit-quarry-7412');
    await fireEvent.press(screen.getByRole('button', { name: words.delete.submit }));

    expect(account.requestAccountDeletion).toHaveBeenCalledWith('plum-orbit-quarry-7412');
    await waitFor(() => expect(screen.getByRole('button', { name: words.delete.cancel })).toBeOnTheScreen());
  });

  it('shows a pending deletion with the day it was asked for, and keeps the account', async () => {
    setSessionState({ status: 'signed-in', account: { ...ANA, deletionRequestedAt: REQUESTED_AT } });
    account.cancelAccountDeletion.mockImplementationOnce(async () => {
      setSessionState({ status: 'signed-in', account: ANA });
      return ANA;
    });
    await renderUi(<DeleteAccountScreen />, setting);

    const day = setting.locale === 'pt-BR' ? '14/09/2026' : '2026-09-14';
    expect(screen.getByText(words.delete.pending.replace('{date}', day))).toBeOnTheScreen();
    expect(screen.queryByLabelText(words.fields.password)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: words.delete.cancel }));

    expect(account.cancelAccountDeletion).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText(words.fields.password)).toBeOnTheScreen());
  });
});
