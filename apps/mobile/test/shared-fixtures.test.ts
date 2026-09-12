/**
 * The shared fixture is well-formed, checked exactly as pytest checks it (06 §3).
 *
 * This validates the fixture's own consistency, not an implementation: round_to_increment arrives with
 * the ADR-004 spike, and runs these same cases then.
 */
import fixture from '@cyberathlete/shared/fixtures/round_to_increment.json';

const EPSILON = 1e-9;

describe('the round_to_increment fixture', () => {
  it('names its function and has cases', () => {
    expect(fixture.function).toBe('round_to_increment');
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  it.each(fixture.cases)('$name', ({ weight_kg: weight, increment_kg: increment, mode, expected_steps: steps }) => {
    const load = steps * increment;

    expect(increment).toBeGreaterThan(0);
    expect(Number.isInteger(steps)).toBe(true);
    if (mode === 'down') {
      expect(load).toBeLessThanOrEqual(weight + EPSILON);
      expect(weight - load).toBeLessThan(increment);
    } else if (mode === 'up') {
      expect(load).toBeGreaterThanOrEqual(weight - EPSILON);
      expect(load - weight).toBeLessThan(increment);
    } else {
      expect(mode).toBe('nearest');
      expect(Math.abs(load - weight)).toBeLessThanOrEqual(increment / 2 + EPSILON);
    }
  });
});
