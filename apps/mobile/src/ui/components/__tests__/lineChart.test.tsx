/**
 * The history chart (task 004 stage 7) in both languages, both unit systems and both themes.
 *
 * Tested by **moving** it, per ADR-014 § Amendment: it is laid out, tapped and stepped with the adjustable actions, and
 * each move is checked in what the reader and the screen reader get — not only rendered once in a starting state.
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { MATRIX, renderUi } from '../../../../test/render';
import { LineChart, type LineChartPoint } from '../LineChart';

const WORDS = {
  en: { noValue: 'nothing to plot', summary: 'Top set, 4 sessions, day 1 to day 4. Highest 102.' },
  'pt-BR': { noValue: 'nada para mostrar', summary: 'Top set, 4 sessões, de day 1 a day 4. Máximo de 102.' },
} as const;

const POINTS: LineChartPoint[] = [
  { key: 'w1', x: 0, y: 100, dayLabel: 'day 1' },
  { key: 'w2', x: 3, y: 102, dayLabel: 'day 2' },
  { key: 'w3', x: 7, y: null, dayLabel: 'day 3' },
  { key: 'w4', x: 9, y: 101, dayLabel: 'day 4' },
];

const format = (value: number) => `${String(value)} u`;
const speak = (value: number) => String(value);

const TITLE = 'Top set';
const chart = () => <LineChart title={TITLE} points={POINTS} formatValue={format} speakValue={speak} hue="strength" />;
const plot = () => screen.getByTestId('line-chart-plot');

async function layOut(width = 300) {
  await fireEvent(plot(), 'layout', { nativeEvent: { layout: { width, height: 144, x: 0, y: 0 } } });
}

describe.each(MATRIX)('$locale, $unitSystem, $preference', (setting) => {
  const words = WORDS[setting.locale];

  it('names the series once and says it in full to a screen reader', async () => {
    await renderUi(chart(), setting);
    expect(screen.getByText('Top set')).toBeOnTheScreen();
    expect(plot().props.accessibilityLabel).toBe(words.summary);
    expect(plot().props.accessibilityRole).toBe('adjustable');
  });

  it('opens on the latest session with a value', async () => {
    await renderUi(chart(), setting);
    expect(screen.getByText('day 4 · 101 u')).toBeOnTheScreen();
  });

  it('breaks the line at the gap, draws the lone point as one dot, and plots nothing at zero (INV-07)', async () => {
    await renderUi(chart(), setting);
    await layOut();
    // The two points before the gap make one line; the one after it stands alone and is a dot — drawn once, although
    // it is also the selected point.
    expect(screen.queryAllByTestId('line-chart-segment')).toHaveLength(1);
    expect(screen.queryAllByTestId('line-chart-dot')).toHaveLength(1);
    // No axis value reaches down to zero: the gap contributed nothing to the scale.
    expect(screen.queryByText('0 u')).toBeNull();
  });

  it('moves the readout to the session nearest a tap — the gap included, said as a gap', async () => {
    await renderUi(chart(), setting);
    await layOut();
    await fireEvent.press(plot(), { nativeEvent: { locationX: 0 } });
    expect(screen.getByText('day 1 · 100 u')).toBeOnTheScreen();

    // Day 3 is 7/9 of the way along a 300 dp plot, less its insets.
    await fireEvent.press(plot(), { nativeEvent: { locationX: 230 } });
    expect(screen.getByText(`day 3 · ${words.noValue}`)).toBeOnTheScreen();
  });

  it('steps through the sessions with the adjustable actions, and says each one', async () => {
    await renderUi(chart(), setting);
    expect(plot().props.accessibilityValue).toEqual({ text: 'day 4 · 101' });

    await fireEvent(plot(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(plot().props.accessibilityValue).toEqual({ text: `day 3 · ${words.noValue}` });
    await fireEvent(plot(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(plot().props.accessibilityValue).toEqual({ text: 'day 2 · 102' });
    for (let step = 0; step < 3; step += 1) {
      await fireEvent(plot(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    }
    // Held at the last session rather than running off the end.
    expect(plot().props.accessibilityValue).toEqual({ text: 'day 4 · 101' });
  });

  it('shows the first and last day under the plot', async () => {
    await renderUi(chart(), setting);
    expect(screen.getByText('day 1')).toBeOnTheScreen();
    expect(screen.getByText('day 4')).toBeOnTheScreen();
  });
});
