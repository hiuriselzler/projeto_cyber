/**
 * A line chart's arithmetic (task 004 stage 7): round axis values, points placed on real time, and a missing value that
 * breaks the line rather than dropping it to zero (INV-03, INV-07).
 */
import { latestWithValue, nearestPoint, niceTicks, plotChart, type ChartPoint } from '../chartGeometry';

const BOX = { width: 200, height: 100, inset: 0 };

function point(key: string, x: number, y: number | null): ChartPoint {
  return { key, x, y };
}

describe('axis values', () => {
  it('are round numbers that cover the data', () => {
    expect(niceTicks(62.5, 100)).toEqual([60, 80, 100]);
    expect(niceTicks(62.5, 101)).toEqual([60, 80, 100, 120]);
    expect(niceTicks(135, 225)).toEqual([100, 150, 200, 250]);
  });

  it('read cleanly at small steps, with no floating-point tail', () => {
    for (const tick of niceTicks(0.1, 0.35)) {
      expect(String(tick).length).toBeLessThanOrEqual(4);
    }
  });

  it('give a flat series a band rather than a zero-height axis', () => {
    const ticks = niceTicks(100, 100);
    expect(ticks.length).toBeGreaterThan(1);
    expect(Math.min(...ticks)).toBeLessThan(100);
    expect(Math.max(...ticks)).toBeGreaterThan(100);
  });

  it('are none for nothing', () => {
    expect(niceTicks(Number.NaN, 1)).toEqual([]);
  });
});

describe('a plot', () => {
  it('places time left to right by the day, so uneven gaps stay uneven (INV-25)', () => {
    const plot = plotChart([point('a', 0, 60), point('b', 1, 70), point('c', 10, 80)], BOX);
    const [a, b, c] = plot.points;
    expect(a?.cx).toBe(0);
    expect(c?.cx).toBe(200);
    expect(b?.cx).toBe(20);
  });

  it('puts a higher value higher', () => {
    const plot = plotChart([point('a', 0, 60), point('b', 1, 100)], BOX);
    expect(plot.points[1]?.cy).toBeLessThan(plot.points[0]?.cy ?? 0);
  });

  it('breaks the line at a gap and never plots the gap at zero (INV-07)', () => {
    const plot = plotChart(
      [point('a', 0, 80), point('b', 1, 82), point('gap', 2, null), point('c', 3, 84), point('d', 4, 85)],
      BOX,
    );
    expect(plot.segments).toHaveLength(2);
    expect(plot.points[2]?.cy).toBeNull();
    // The axis starts from the data, not from zero: a null contributed nothing to it.
    expect(plot.ticks[0]?.value).toBeGreaterThan(0);
  });

  it('draws a value standing alone between gaps as a dot, since a line of one point is nothing', () => {
    const plot = plotChart([point('a', 0, null), point('b', 1, 90), point('c', 2, null)], BOX);
    expect(plot.segments).toHaveLength(0);
    expect(plot.isolated.map((each) => each.key)).toEqual(['b']);
  });

  it('centres a single day', () => {
    const plot = plotChart([point('a', 5, 90)], BOX);
    expect(plot.points[0]?.cx).toBe(100);
  });

  it('has no gridlines when there is nothing to plot', () => {
    expect(plotChart([point('a', 0, null)], BOX).ticks).toEqual([]);
  });
});

describe('the readout', () => {
  it('starts on the latest point with a value', () => {
    expect(latestWithValue([point('a', 0, 60), point('b', 1, 70), point('c', 2, null)])).toBe(1);
  });

  it('moves to the point nearest a touch', () => {
    const plot = plotChart([point('a', 0, 60), point('b', 1, 70), point('c', 2, 80)], BOX);
    expect(nearestPoint(plot.points, 90)).toBe(1);
    expect(nearestPoint(plot.points, 190)).toBe(2);
  });
});
