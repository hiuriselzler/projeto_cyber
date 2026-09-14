import { durations } from '../../tokens';
import { houseEasing, motionFor, type MotionKind } from '../motion';

const KINDS: MotionKind[] = ['stateChange', 'transition', 'emphasis'];

describe('motion (07 §7)', () => {
  it.each(KINDS)('%s moves on the house curve for its token duration', (kind) => {
    expect(motionFor(kind, false)).toEqual({ style: 'move', duration: durations[kind], easing: 'house' });
  });

  it.each(KINDS)('under reduce motion, %s travels nowhere and lasts no longer than a cross-fade', (kind) => {
    const spec = motionFor(kind, true);

    expect(spec.style).not.toBe('move');
    expect(spec.duration).toBeLessThanOrEqual(durations.crossFade);
  });

  it('shows emphasis as a static state under reduce motion', () => {
    expect(motionFor('emphasis', true)).toEqual({ style: 'none', duration: 0, easing: 'linear' });
  });

  it('eases from rest to rest without overshoot', () => {
    const samples = Array.from({ length: 101 }, (_, step) => houseEasing(step / 100));

    expect(samples[0]).toBeCloseTo(0, 6);
    expect(samples[100]).toBeCloseTo(1, 6);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1 + 1e-9);
    samples.slice(1).forEach((value, index) => expect(value).toBeGreaterThanOrEqual(samples[index] - 1e-9));
  });
});
