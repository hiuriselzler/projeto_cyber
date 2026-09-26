/**
 * The development-only ✓ timer — task 004's closing decision 3. What matters is that it changes nothing it times: the
 * write runs once, synchronously, and its result comes back, whether the timer is on or off (INV-09).
 */
import { timeTick, type TickTiming } from '../tickTiming';

describe('timeTick', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs the ✓ once and hands back its result, reporting after the next frame', () => {
    const run = jest.fn(() => 'fresh');
    const reports: TickTiming[] = [];

    expect(timeTick(run, (timing) => reports.push(timing), true)).toBe('fresh');
    expect(run).toHaveBeenCalledTimes(1);
    expect(reports).toEqual([]); // the write is done before anything is reported

    jest.runAllTimers();
    expect(reports).toHaveLength(1);
    const [timing] = reports;
    expect(timing?.writeMs).toBeGreaterThanOrEqual(0);
    expect(timing?.frameMs).toBeGreaterThanOrEqual(timing?.writeMs ?? Infinity);
  });

  it('is off under Jest by default, and then only runs the ✓', () => {
    const run = jest.fn(() => 'fresh');
    const report = jest.fn();

    expect(timeTick(run, report)).toBe('fresh');
    jest.runAllTimers();
    expect(run).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });
});
