import { Easing, type EasingFunction } from 'react-native';

import { durations, easing } from '../tokens';

/** The three kinds of motion in 07 §7. */
export type MotionKind = 'stateChange' | 'transition' | 'emphasis';

export interface MotionSpec {
  /** `move` travels or scales; `crossFade` only changes opacity; `none` shows the end state at once. */
  readonly style: 'move' | 'crossFade' | 'none';
  readonly duration: number;
  readonly easing: 'house' | 'linear';
}

/**
 * How a kind of motion runs (07 §7). Under reduce motion nothing travels and nothing lasts longer than a cross-fade:
 * transitions become cross-fades, and emphasis becomes a static state.
 */
export function motionFor(kind: MotionKind, reduceMotion: boolean): MotionSpec {
  if (!reduceMotion) {
    return { style: 'move', duration: durations[kind], easing: 'house' };
  }
  if (kind === 'emphasis') {
    return { style: 'none', duration: 0, easing: 'linear' };
  }
  return { style: 'crossFade', duration: Math.min(durations[kind], durations.crossFade), easing: 'linear' };
}

const [x1, y1, x2, y2] = easing.house;

/** The house curve, a fit to a critically-damped response. Every animation uses a timing; springs are banned. */
export const houseEasing: EasingFunction = Easing.bezier(x1, y1, x2, y2);

export function easingOf(spec: MotionSpec): EasingFunction {
  return spec.easing === 'house' ? houseEasing : Easing.linear;
}
