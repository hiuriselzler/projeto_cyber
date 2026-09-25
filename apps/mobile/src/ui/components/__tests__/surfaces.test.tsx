/**
 * The sheet, segmented control, empty state, level-up state, record state and mark, in both languages, both unit
 * systems and both themes (task 011; the record state, task 004 stage 6).
 */
import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { space } from '../../tokens';

import { MATRIX, renderUi, TEST_METRICS } from '../../../../test/render';
import { PLACEHOLDER_LEVELS } from '../../brand/marks.generated';
import { EmptyState } from '../EmptyState';
import { LevelUpState } from '../LevelUpState';
import { Mark } from '../Mark';
import { RecordState } from '../RecordState';
import { Screen } from '../Screen';
import { SegmentedControl } from '../SegmentedControl';
import { Sheet } from '../Sheet';

const WORDS = {
  en: { close: 'Close', levelUp: 'track reached level 12. reason', level: 'Level 12' },
  'pt-BR': { close: 'Fechar', levelUp: 'track chegou ao nível 12. reason', level: 'Nível 12' },
} as const;

const OPEN = 'open';

/** A caller that toggles `visible`, the way every real one does — see the transition tests below. */
function SheetHarness({ title }: { readonly title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={OPEN} onPress={() => setOpen(true)} />
      <Sheet visible={open} title={title} onClose={() => setOpen(false)}>
        <EmptyState title="" />
      </Sheet>
    </>
  );
}

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

  /**
   * [ADR-014 § Amendment](../../../../../docs/decisions/ADR-014.md): a component with a state prop is tested by
   * **moving** it. The two tests above pass `visible` as a constant, and between them they left the `false → true`
   * path untested — which is the path that was broken. `Sheet` never opened at all for nine days, on every build,
   * and no gate in the project could see it.
   */
  it('opens when its caller moves visible from false to true', async () => {
    const title = 'title';
    await renderUi(<SheetHarness title={title} />, setting);

    expect(screen.queryByText(title)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: OPEN }));
    expect(screen.getByText(title)).toBeOnTheScreen();
  });

  it('closes again when its caller moves visible back to false', async () => {
    const title = 'title';
    await renderUi(<SheetHarness title={title} />, setting);

    await fireEvent.press(screen.getByRole('button', { name: OPEN }));
    await fireEvent.press(screen.getByRole('button', { name: words.close }));
    expect(screen.queryByText(title)).toBeNull();
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

  it('states each personal record as a fact — its kind, whose, and the number (task 004 stage 6)', async () => {
    const records = [
      { key: 'a', kind: 'kind one', subject: 'Supino do João', value: '110 kg' },
      { key: 'b', kind: 'kind two', subject: 'subject two', value: '7' },
    ];
    const heading = 'records';
    await renderUi(<RecordState title={heading} records={records} />, setting);

    expect(screen.getByRole('header', { name: heading })).toBeOnTheScreen();
    for (const record of records) {
      expect(screen.getByText(record.kind)).toBeOnTheScreen();
      // The user's own exercise name reads back exactly as typed, never translated (INV-27).
      expect(screen.getByText(record.subject)).toBeOnTheScreen();
      expect(screen.getByText(record.value)).toBeOnTheScreen();
    }
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
/**
 * The task 004 stage 6 device pass found the exercise picker's sheet taller than the screen — its title, close button
 * and search field above the top edge — because the sheet neither kept out of the insets nor shrank. These pin both.
 */
describe('a sheet', () => {
  it('keeps below the status bar, with backdrop left above it to tap', async () => {
    await renderUi(
      <Sheet visible onClose={jest.fn()}>
        <EmptyState title="" />
      </Sheet>,
    );

    const style = StyleSheet.flatten(screen.getByTestId('sheet-frame').props.style);
    expect(style.paddingTop).toBe(TEST_METRICS.insets.top + space[12]);
  });

  it('shrinks to the room it has, so a long list inside scrolls instead of pushing its header off screen', async () => {
    await renderUi(
      <Sheet visible onClose={jest.fn()}>
        <EmptyState title="" />
      </Sheet>,
    );

    expect(StyleSheet.flatten(screen.getByTestId('sheet').props.style).flexShrink).toBe(1);
  });
});

describe('a screen', () => {
  it('keeps its content out of the system insets', async () => {
    await renderUi(<Screen />);

    const style = StyleSheet.flatten(screen.getByTestId('screen').props.style);
    expect(style.paddingTop).toBe(TEST_METRICS.insets.top);
    expect(style.paddingBottom).toBe(TEST_METRICS.insets.bottom);
  });
});
