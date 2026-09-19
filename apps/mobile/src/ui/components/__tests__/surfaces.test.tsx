/**
 * The sheet, segmented control, empty state, level-up state and mark, in both languages, both unit systems and both
 * themes (task 011).
 */
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { MATRIX, renderUi, TEST_METRICS } from '../../../../test/render';
import { PLACEHOLDER_LEVELS } from '../../brand/marks.generated';
import { EmptyState } from '../EmptyState';
import { LevelUpState } from '../LevelUpState';
import { Mark } from '../Mark';
import { Screen } from '../Screen';
import { SegmentedControl } from '../SegmentedControl';
import { Sheet } from '../Sheet';

const WORDS = {
  en: { close: 'Close', levelUp: 'track reached level 12. reason', level: 'Level 12' },
  'pt-BR': { close: 'Fechar', levelUp: 'track chegou ao nível 12. reason', level: 'Nível 12' },
} as const;

describe.each(MATRIX)('$locale, $unitSystem, $preference', (setting) => {
  const words = WORDS[setting.locale];

  it('opens a sheet with its title and a full-size, labelled close button', async () => {
    const title = 'title';
    const onClose = jest.fn();
    await renderUi(
      <Sheet visible title={title} onClose={onClose}>
        <EmptyState title="" />
      </Sheet>,
      setting,
    );

    expect(screen.getByText(title)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: words.close }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing for a sheet that was never opened', async () => {
    await renderUi(
      <Sheet visible={false} onClose={jest.fn()}>
        <EmptyState title="" />
      </Sheet>,
      setting,
    );

    expect(screen.queryByRole('button', { name: words.close })).toBeNull();
  });

  it('chooses one segment, marked as checked', async () => {
    const onChange = jest.fn();
    const group = 'group';
    const options = [
      { value: 'a', label: 'first' },
      { value: 'b', label: 'second' },
    ] as const;
    await renderUi(<SegmentedControl accessibilityLabel={group} options={options} value="a" onChange={onChange} />, setting);

    expect(screen.getByRole('radio', { name: 'first' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'second' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('states an empty screen plainly', async () => {
    const title = 'nothing yet';
    const body = 'body';
    await renderUi(<EmptyState title={title} body={body} />, setting);

    expect(screen.getByText(title)).toBeOnTheScreen();
    expect(screen.getByText(body)).toBeOnTheScreen();
  });

  it('announces a level reached as a fact', async () => {
    const trackName = 'track';
    const reason = 'reason';
    await renderUi(<LevelUpState trackName={trackName} hue="swim" level={12} reason={reason} />, setting);

    expect(screen.getByLabelText(words.levelUp)).toBeOnTheScreen();
    expect(screen.getByText(words.level)).toBeOnTheScreen();
  });

  it('draws the mark as an image named for the brand', async () => {
    await renderUi(<Mark level="glyph" size={32} />, setting);

    expect(screen.getByRole('image', { name: 'CyberAthlete' })).toBeOnTheScreen();
  });
});

describe('the mark’s slots', () => {
  it('still hold task 011’s placeholder at every level, until task 018', () => {
    expect([...PLACEHOLDER_LEVELS].sort()).toEqual(['full', 'glyph', 'reduced', 'silhouette']);
  });
});

/**
 * The app draws its own headers, so nothing else keeps a screen's first line out from under the
 * status bar. Task 017 found `Entrar` and `Crie sua conta` painted behind the clock on a phone —
 * Jest could not have caught it, because the harness had no insets at all. It has them now
 * (`TEST_METRICS`), and this is the guard.
 */
describe('a screen', () => {
  it('keeps its content out of the system insets', async () => {
    await renderUi(<Screen />);

    const style = StyleSheet.flatten(screen.getByTestId('screen').props.style);
    expect(style.paddingTop).toBe(TEST_METRICS.insets.top);
    expect(style.paddingBottom).toBe(TEST_METRICS.insets.bottom);
  });
});
