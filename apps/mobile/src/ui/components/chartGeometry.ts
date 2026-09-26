/**
 * The arithmetic of a line chart, apart from the drawing (task 004 stage 7), so it is tested without a renderer.
 *
 * Nothing here knows a unit or a language: values arrive already in the user's unit (INV-01 — the formatting module
 * converted them) and leave as coordinates. A missing value is a gap in the line and never a zero (INV-03, INV-07).
 */

export interface ChartPoint {
  readonly key: string;
  /** Position on the time axis — a day number, so spacing is real time (INV-25). */
  readonly x: number;
  /** In the user's unit, or null where there is nothing to plot. */
  readonly y: number | null;
}

export interface PlottedPoint {
  readonly key: string;
  readonly cx: number;
  /** Null for a gap: the point has a place on the time axis and no height. */
  readonly cy: number | null;
}

export interface Plot {
  /** One SVG path per unbroken run of values. A gap ends a run; a run of one is drawn as a dot instead. */
  readonly segments: readonly string[];
  /** Points standing alone between gaps, which a line cannot show. */
  readonly isolated: readonly PlottedPoint[];
  readonly points: readonly PlottedPoint[];
  /** Horizontal gridlines, value and height, lowest first. */
  readonly ticks: readonly { readonly value: number; readonly y: number }[];
}

/** 1, 2 or 5 times a power of ten, at or above `value` — the steps a person reads without effort. */
function niceStep(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));
  const fraction = value / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

/** Undo floating-point drift on a multiple of `step`: 0.1 × 3 is 0.30000000000000004, and a tick must read 0.3. */
function clean(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Number(value.toFixed(decimals));
}

/**
 * Round axis values spanning `[min, max]`, about `count` of them. A flat series (one value, or every value equal) gets
 * a band around it rather than a zero-height axis.
 */
export function niceTicks(min: number, max: number, count = 3): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  let low = Math.min(min, max);
  let high = Math.max(min, max);
  if (low === high) {
    const pad = low === 0 ? 1 : Math.abs(low) * 0.1;
    low -= pad;
    high += pad;
  }
  const step = niceStep((high - low) / Math.max(1, count - 1));
  const first = Math.floor(low / step) * step;
  const ticks: number[] = [];
  for (let value = first; value < high + step / 2; value += step) {
    ticks.push(clean(value, step));
  }
  // The last tick must reach the maximum; the loop's half-step slack can stop one short of it.
  const last = ticks.at(-1);
  if (last !== undefined && last < high) ticks.push(clean(last + step, step));
  return ticks;
}

/**
 * Where every point sits in a `width` × `height` box, `inset` in from each edge so a dot at the extreme is drawn whole.
 * Time runs left to right; a single day sits in the middle.
 *
 * `gutter` is room kept clear on the left for the axis values, which sit on their gridlines there: without it the
 * oldest point, when it is also the lowest, is drawn straight through its own axis label. `headroom` keeps the top
 * gridline one label below the top edge, so its value, standing on it, stays inside the plot — at 200 % font it rose
 * over the readout above (both found on the task 004 stage 7 device pass).
 */
export function plotChart(
  points: readonly ChartPoint[],
  box: {
    readonly width: number;
    readonly height: number;
    readonly inset: number;
    readonly gutter?: number;
    readonly headroom?: number;
  },
): Plot {
  const values = points.flatMap((point) => (point.y === null ? [] : [point.y]));
  const ticks = values.length === 0 ? [] : niceTicks(Math.min(...values), Math.max(...values));
  const bottom = ticks[0] ?? 0;
  const top = ticks.at(-1) ?? 1;
  const xs = points.map((point) => point.x);
  const left = Math.min(...xs);
  const right = Math.max(...xs);

  const start = (box.gutter ?? 0) + box.inset;
  const innerWidth = Math.max(0, box.width - start - box.inset);
  const ceiling = Math.max(box.inset, box.headroom ?? 0);
  const innerHeight = Math.max(0, box.height - ceiling - box.inset);
  const xOf = (x: number) => start + (right === left ? innerWidth / 2 : ((x - left) / (right - left)) * innerWidth);
  const yOf = (y: number) => ceiling + innerHeight - ((y - bottom) / (top - bottom)) * innerHeight;

  const plotted: PlottedPoint[] = points.map((point) => ({
    key: point.key,
    cx: xOf(point.x),
    cy: point.y === null ? null : yOf(point.y),
  }));

  const segments: string[] = [];
  const isolated: PlottedPoint[] = [];
  let run: PlottedPoint[] = [];
  const close = () => {
    if (run.length === 1) isolated.push(run[0] as PlottedPoint);
    if (run.length > 1) {
      segments.push(run.map((point, at) => `${at === 0 ? 'M' : 'L'}${round(point.cx)} ${round(point.cy ?? 0)}`).join(' '));
    }
    run = [];
  };
  for (const point of plotted) {
    if (point.cy === null) close();
    else run.push(point);
  }
  close();

  return { segments, isolated, points: plotted, ticks: ticks.map((value) => ({ value, y: yOf(value) })) };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The point whose time is nearest a touch at horizontal position `x` — a reader aims at a date, never at a 2 dp line. */
export function nearestPoint(points: readonly PlottedPoint[], x: number): number {
  let best = -1;
  let distance = Number.POSITIVE_INFINITY;
  points.forEach((point, at) => {
    const gap = Math.abs(point.cx - x);
    if (gap < distance) {
      best = at;
      distance = gap;
    }
  });
  return best;
}

/** The last point that has a value — where a chart's readout starts, since "where am I now" is the question. */
export function latestWithValue(points: readonly ChartPoint[]): number {
  for (let at = points.length - 1; at >= 0; at -= 1) {
    if (points[at]?.y !== null) return at;
  }
  return points.length - 1;
}
