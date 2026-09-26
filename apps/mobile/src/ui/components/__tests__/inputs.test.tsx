/**
 * The workout inputs and the metric tile, in both languages, both unit systems and both themes (task 011).
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { MATRIX, renderUi } from '../../../../test/render';
import { formatDistance } from '../../format/quantities';
import { sizes, typography } from '../../tokens';
import { MetricTile } from '../MetricTile';
import { NumericKeypad } from '../NumericKeypad';
import { RirChips } from '../RirChips';

/** What depends on the language alone. */
const WORDS = {
  en: {
    rir2: 'RIR 2',
    rir7: 'RIR 7',
    rir5: 'RIR 5 or more',
    separator: '.',
    separatorLabel: 'Decimal separator',
    delete: 'Delete',
    done: 'Done',
  },
  'pt-BR': {
    rir2: 'RIR 2',
    rir7: 'RIR 7',
    rir5: 'RIR 5 ou mais',
    separator: ',',
    separatorLabel: 'Separador decimal',
    delete: 'Apagar',
    done: 'OK',
  },
} as const;

/** 5 km, as each language and unit system shows it and says it. */
const FIVE_KILOMETRES = {
  en: {
    metric: { unit: 'km', spoken: '5 kilometers' },
    imperial: { unit: 'mi', spoken: '3.11 miles' },
  },
  'pt-BR': {
    metric: { unit: 'km', spoken: '5 quilômetros' },
    imperial: { unit: 'mi', spoken: '3,11 milhas' },
  },
} as const;

describe.each(MATRIX)('$locale, $unitSystem, $preference', (setting) => {
  const words = WORDS[setting.locale];

  describe('RIR chips', () => {
    it('offers 0–4 and the 5+ disclosure, and selects one with a tap', async () => {
      const onChange = jest.fn();
      await renderUi(<RirChips value={null} onChange={onChange} />, setting);

      expect(screen.getAllByRole('radio')).toHaveLength(5);
      expect(screen.getByRole('button', { name: words.rir5 })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('radio', { name: words.rir2 }));
      expect(onChange).toHaveBeenCalledWith(2);
    });

    it('clears back to not recorded — null, never 0 — when the selected chip is tapped (INV-03)', async () => {
      const onChange = jest.fn();
      await renderUi(<RirChips value={2} onChange={onChange} />, setting);

      expect(screen.getByRole('radio', { name: words.rir2 })).toBeChecked();
      await fireEvent.press(screen.getByRole('radio', { name: words.rir2 }));
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('marks the selected chip by its shape as well as its colour (INV-24)', async () => {
      await renderUi(<RirChips value={2} onChange={jest.fn()} />, setting);

      expect(screen.getByRole('radio', { name: words.rir2 })).toHaveStyle({ borderWidth: sizes.edgeSelected });
      expect(screen.getByRole('button', { name: words.rir5 })).toHaveStyle({ borderWidth: sizes.edgeHairline });
    });

    // Open question 9, decided 2026-09-19: `5+` opens `5 6 7 8 9 10` and stores nothing by itself.
    it('stores nothing when 5+ is pressed — it only opens the second row', async () => {
      const onChange = jest.fn();
      await renderUi(<RirChips value={null} onChange={onChange} />, setting);

      expect(screen.queryByRole('radio', { name: words.rir7 })).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: words.rir5 }));

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: words.rir5 })).toBeExpanded();
      // INV-03's full range, reachable in two taps: 0–4 stay up, and 5 to 10 join them.
      expect(screen.getAllByRole('radio')).toHaveLength(11);
    });

    it('stores whichever chip of the second row is then tapped', async () => {
      const onChange = jest.fn();
      await renderUi(<RirChips value={null} onChange={onChange} />, setting);

      await fireEvent.press(screen.getByRole('button', { name: words.rir5 }));
      await fireEvent.press(screen.getByRole('radio', { name: words.rir7 }));
      expect(onChange).toHaveBeenCalledWith(7);
    });

    it('shows a stored 7 on its own row, without the user opening it again (INV-09)', async () => {
      await renderUi(<RirChips value={7} onChange={jest.fn()} />, setting);

      expect(screen.getByRole('radio', { name: words.rir7 })).toBeChecked();
      // Selected, so a sighted user sees where the 7 came from. A button, not a radio: it holds no value of its own,
      // and a screen reader must not hear a press that stores nothing as though it stored something.
      const disclosure = screen.getByRole('button', { name: words.rir5 });
      expect(disclosure).toBeSelected();
      expect(disclosure).toBeExpanded();
    });

    it('clears a second-row value back to null on a second tap, like every other chip (INV-03)', async () => {
      const onChange = jest.fn();
      await renderUi(<RirChips value={7} onChange={onChange} />, setting);

      await fireEvent.press(screen.getByRole('radio', { name: words.rir7 }));
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  describe('numeric keypad', () => {
    it('shows the locale’s separator and types with it', async () => {
      const onChange = jest.fn();
      await renderUi(<NumericKeypad value="62" onChange={onChange} onDone={jest.fn()} />, setting);

      const separator = screen.getByRole('button', { name: words.separatorLabel });
      expect(separator).toHaveTextContent(words.separator);
      await fireEvent.press(separator);
      expect(onChange).toHaveBeenCalledWith(`62${words.separator}`);
    });

    it('continues a value that carries the other separator', async () => {
      const onChange = jest.fn();
      const other = words.separator === ',' ? '62.5' : '62,5';
      await renderUi(<NumericKeypad value={other} onChange={onChange} onDone={jest.fn()} />, setting);

      await fireEvent.press(screen.getByRole('button', { name: '0' }));
      expect(onChange).toHaveBeenCalledWith(`62${words.separator}50`);
    });

    it('deletes, and finishes with a labelled done key', async () => {
      const onChange = jest.fn();
      const onDone = jest.fn();
      await renderUi(<NumericKeypad value="62" onChange={onChange} onDone={onDone} />, setting);

      await fireEvent.press(screen.getByRole('button', { name: words.delete }));
      expect(onChange).toHaveBeenCalledWith('6');
      await fireEvent.press(screen.getByRole('button', { name: words.done }));
      expect(onDone).toHaveBeenCalled();
    });

    it('offers no separator for whole numbers, such as reps', async () => {
      await renderUi(<NumericKeypad value="6" onChange={jest.fn()} onDone={jest.fn()} allowDecimal={false} />, setting);

      expect(screen.getByRole('button', { name: words.separatorLabel })).toBeDisabled();
    });
  });

  describe('metric tile', () => {
    it('sets the number tabular with its unit one step smaller, and speaks the quantity in full', async () => {
      const label = 'distance';
      const expected = FIVE_KILOMETRES[setting.locale][setting.unitSystem];
      const quantity = formatDistance(5000, setting.unitSystem, setting.locale);
      await renderUi(<MetricTile label={label} quantity={quantity} />, setting);

      expect(screen.getByLabelText(label)).toHaveAccessibilityValue({ text: expected.spoken });
      expect(screen.getByText(quantity.text)).toHaveStyle({
        fontVariant: ['tabular-nums'],
        fontSize: typography.metric.fontSize,
      });
      expect(screen.getByText(expected.unit)).toHaveStyle({ fontSize: typography.title.fontSize });
    });
  });
});
