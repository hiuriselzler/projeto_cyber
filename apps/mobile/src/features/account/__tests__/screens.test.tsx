/**
 * The account screens in both languages (INV-27, task 003). The flows are mocked; they are tested in src/account.
 */
import en from '@cyberathlete/shared/i18n/en.json';
import ptBR from '@cyberathlete/shared/i18n/pt-BR.json';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ACCOUNT_ERROR_CODES, AccountError } from '@/account/errors';

import { MATRIX, renderUi } from '../../../../test/render';
import { ResetPasswordScreen } from '../ResetPasswordScreen';
import { SignInScreen } from '../SignInScreen';

jest.mock('@/account', () => ({
  ...jest.requireActual('@/account/errors'),
  signIn: jest.fn(),
  requestPasswordReset: jest.fn(),
  confirmPasswordReset: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: jest.fn(() => ({})),
  Redirect: () => null,
}));

const account = jest.requireMock('@/account') as {
  signIn: jest.Mock;
  requestPasswordReset: jest.Mock;
  confirmPasswordReset: jest.Mock;
};
const router = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock };

const CATALOGS = { en: en.account, 'pt-BR': ptBR.account } as const;
const LANGUAGES = MATRIX.filter((setting) => setting.unitSystem === 'metric' && setting.preference === 'dark');

describe.each(LANGUAGES)('$locale', (setting) => {
  const words = CATALOGS[setting.locale];

  beforeEach(() => {
    jest.clearAllMocks();
    router.useLocalSearchParams.mockReturnValue({});
  });

  it('signs in with what was typed, and says why it was refused', async () => {
    account.signIn.mockRejectedValueOnce(new AccountError('invalid_credentials'));
    await renderUi(<SignInScreen />, setting);

    await fireEvent.changeText(screen.getByLabelText(words.fields.email), ' ana@example.com ');
    await fireEvent.changeText(screen.getByLabelText(words.fields.password), 'plum-orbit-quarry-7412');
    await fireEvent.press(screen.getByRole('button', { name: words.sign_in.submit }));

    expect(account.signIn).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'plum-orbit-quarry-7412' });
    await waitFor(() => expect(screen.getByText(words.errors.invalid_credentials)).toBeOnTheScreen());
  });

  it('warns that a reset removes the privacy zones before the reset can be confirmed', async () => {
    router.useLocalSearchParams.mockReturnValue({ token: 'reset-token-0123456789abcdef' });
    account.confirmPasswordReset.mockResolvedValueOnce(undefined);
    await renderUi(<ResetPasswordScreen />, setting);

    expect(screen.getByText(words.reset.zones_warning)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText(words.fields.new_password), 'lantern-fjord-mosaic-3091');
    await fireEvent.press(screen.getByRole('button', { name: words.reset.confirm_submit }));

    expect(account.confirmPasswordReset).toHaveBeenCalledWith({
      token: 'reset-token-0123456789abcdef',
      newPassword: 'lantern-fjord-mosaic-3091',
    });
    await waitFor(() => expect(screen.getByText(words.reset.done)).toBeOnTheScreen());
  });

  it('asks for a reset link when opened without one', async () => {
    account.requestPasswordReset.mockResolvedValueOnce(undefined);
    await renderUi(<ResetPasswordScreen />, setting);

    await fireEvent.changeText(screen.getByLabelText(words.fields.email), 'ana@example.com');
    await fireEvent.press(screen.getByRole('button', { name: words.reset.request_submit }));

    expect(account.requestPasswordReset).toHaveBeenCalledWith('ana@example.com');
    expect(screen.queryByText(words.reset.zones_warning)).toBeNull();
  });

  it('has words for every reason an account flow can fail', () => {
    for (const code of ACCOUNT_ERROR_CODES) {
      expect(words.errors[code]).toEqual(expect.any(String));
    }
  });
});
