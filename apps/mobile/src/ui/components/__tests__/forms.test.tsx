/**
 * The form primitives — text field and button — in both languages, both unit systems and both themes (task 003).
 * Components take translated text from their caller, so these strings stand in for catalog messages.
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { MATRIX, renderUi } from '../../../../test/render';
import { sizes } from '../../tokens';
import { Button } from '../Button';
import { TextField } from '../TextField';

const LABEL = 'label';
const HINT = 'hint';
const ERROR = 'error';
const ACTION = 'action';
const WORKING = 'working';

describe.each(MATRIX)('$locale, $unitSystem, $preference', (setting) => {
  describe('text field', () => {
    it('is labelled, reports what is typed, and shows its hint', async () => {
      const onChangeText = jest.fn();
      await renderUi(<TextField label={LABEL} hint={HINT} value="" onChangeText={onChangeText} />, setting);

      await fireEvent.changeText(screen.getByLabelText(LABEL), 'ana@example.com');

      expect(onChangeText).toHaveBeenCalledWith('ana@example.com');
      expect(screen.getByText(HINT)).toBeOnTheScreen();
    });

    it('shows an error as words and a thicker edge, not as colour alone', async () => {
      await renderUi(<TextField label={LABEL} hint={HINT} error={ERROR} value="" onChangeText={jest.fn()} />, setting);

      expect(screen.getByText(ERROR)).toBeOnTheScreen();
      expect(screen.queryByText(HINT)).toBeNull();
      expect(screen.getByLabelText(LABEL)).toHaveStyle({ borderWidth: sizes.edgeSelected });
    });
  });

  describe('button', () => {
    it('presses, at the full target height', async () => {
      const onPress = jest.fn();
      await renderUi(<Button label={ACTION} onPress={onPress} />, setting);

      await fireEvent.press(screen.getByRole('button', { name: ACTION }));

      expect(onPress).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: ACTION })).toHaveStyle({ minHeight: sizes.targetMin });
    });

    it('cannot be pressed while busy, and says what it is doing', async () => {
      const onPress = jest.fn();
      await renderUi(<Button label={ACTION} busy busyLabel={WORKING} onPress={onPress} />, setting);

      const button = screen.getByRole('button', { name: WORKING });
      await fireEvent.press(button);

      expect(onPress).not.toHaveBeenCalled();
      expect(button).toBeBusy();
      expect(button).toBeDisabled();
    });

    it('cannot be pressed while disabled', async () => {
      const onPress = jest.fn();
      await renderUi(<Button label={ACTION} disabled onPress={onPress} />, setting);

      await fireEvent.press(screen.getByRole('button', { name: ACTION }));

      expect(onPress).not.toHaveBeenCalled();
    });
  });
});
