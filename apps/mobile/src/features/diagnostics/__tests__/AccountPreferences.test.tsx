/**
 * The diagnostics screen's units and language switch (task 004 stage 8, decision 5). What it must do is the thing
 * stage 7 found missing: call `updateAccount`, which was written and tested and reached by no screen.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { updateAccount, type LocalAccount } from '@/account';

import { renderUi } from '../../../../test/render';
import { AccountPreferences } from '../AccountPreferences';

const ACCOUNT: LocalAccount = {
  id: 'user-1',
  email: 'ana@example.com',
  emailVerified: true,
  displayName: 'Ana',
  unitSystem: 'metric',
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  deletionRequestedAt: null,
};

const mockState = { status: 'signed-in', account: ACCOUNT };
jest.mock('@/account', () => ({
  getSessionState: () => mockState,
  subscribeToSession: () => () => undefined,
  updateAccount: jest.fn(),
}));

const update = updateAccount as jest.MockedFunction<typeof updateAccount>;

describe('the units and language switch', () => {
  beforeEach(() => update.mockReset());

  it('sends the unit system through updateAccount and says what was saved', async () => {
    update.mockResolvedValue({ ...ACCOUNT, unitSystem: 'imperial' });
    await renderUi(<AccountPreferences />);

    expect(screen.getByText(/account: metric · pt-BR/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'imperial' }));

    expect(update).toHaveBeenCalledWith({ unitSystem: 'imperial' });
    await waitFor(() => expect(screen.getByText(/saved: imperial · pt-BR/)).toBeTruthy());
  });

  it('sends the language on its own', async () => {
    update.mockResolvedValue({ ...ACCOUNT, locale: 'en' });
    await renderUi(<AccountPreferences />);

    await fireEvent.press(screen.getByRole('radio', { name: 'en' }));

    expect(update).toHaveBeenCalledWith({ locale: 'en' });
    await waitFor(() => expect(screen.getByText(/saved: metric · en/)).toBeTruthy());
  });

  it('says so when the API is not there, rather than failing silently', async () => {
    update.mockRejectedValue(new Error('network'));
    await renderUi(<AccountPreferences />);

    await fireEvent.press(screen.getByRole('radio', { name: 'imperial' }));

    await waitFor(() => expect(screen.getByText(/failed: Error: network/)).toBeTruthy());
  });
});
