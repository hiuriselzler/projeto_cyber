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
    rir5: 'RIR 5 or more',
    separator: '.',
    separatorLabel: 'Decimal separator',
    delete: 'Delete',
    done: 'Done',
  },
  'pt-BR': {
    rir2: 'RIR 2',
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
    it('offers six chips, the last open-ended, and selects one with a tap', async () => {
      const onChange = jest.fn();
      await renderUi(<RirChips value={null} onChange={onChange} />, setting);

      expect(screen.getAllByRole('radio')).toHaveLength(6);
      expect(screen.getByRole('radio', { name: words.rir5 })).toBeOnTheScreen();
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
      expect(screen.getByRole('radio', { name: words.rir5 })).toHaveStyle({ borderWidth: sizes.edgeHairline });
      expect(screen.getByRole('radio', { name: words.rir5 })).not.toBeChecked();
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
