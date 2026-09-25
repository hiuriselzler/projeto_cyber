import { sessionMetrics, type LoggedSet, type SessionMetrics } from '@/domain';
import type { Tracking } from '@/db/catalog';
import type { DatedSession, PerformedSet, WorkoutListItem } from '@/db/history';
import {
  dayNumberOf,
  formatDecimal,
  formatDuration,
  formatLocalDate,
  formatShortDistance,
  formatWeight,
  roundForDisplay,
  weightInUnits,
  weightUnitOf,
  type FormattedQuantity,
  type LineChartPoint,
  type Locale,
  type UnitSystem,
  type useT,
} from '@/ui';

/**
 * The history screens' arithmetic — task 004 stage 7 — none of which happens here. Every total and every chart value
 * is the core's `session_metrics()` (INV-04, INV-07): this module decides only which sets go in, in what groups, and
 * turns what comes back into the user's units and words. Like `finish.ts`, it reaches the core, so only the history
 * screens import it.
 */

type T = ReturnType<typeof useT>;

/** A line of the history list: a finished workout and what it came to. */
export interface WorkoutListRow extends WorkoutListItem {
  readonly countedSets: number;
  /** Null when nothing counted had a load — the list then says nothing rather than "0 kg". */
  readonly volumeKg: number | null;
}

/** A page of the list, with its totals — one crossing of the core for the whole page. */
export function listRows(items: readonly WorkoutListItem[], setsOf: ReadonlyMap<string, readonly LoggedSet[]>): WorkoutListRow[] {
  const metrics = sessionMetrics(items.map((item) => setsOf.get(item.id) ?? []));
  return items.map((item, at) => ({
    ...item,
    countedSets: metrics[at]?.countedSets ?? 0,
    volumeKg: metrics[at]?.volumeKg ?? null,
  }));
}

/** An exercise's three chart series, oldest first, and its sessions' metrics beside them. */
export interface ExerciseCharts {
  readonly metrics: readonly SessionMetrics[];
  readonly topLoad: readonly LineChartPoint[];
  readonly e1rm: readonly LineChartPoint[];
  readonly volume: readonly LineChartPoint[];
}

/**
 * The charts of one exercise's history. Values go to the chart in the user's unit (INV-01, converted by the formatting
 * module), placed on real days (INV-17, INV-25), and a session with nothing to plot stays a gap (INV-03, INV-07).
 */
export function exerciseCharts(sessions: readonly DatedSession[], unitSystem: UnitSystem, locale: Locale): ExerciseCharts {
  const metrics = sessionMetrics(sessions.map((session) => session.sets));
  const series = (pick: (each: SessionMetrics) => number | null): LineChartPoint[] =>
    sessions.map((session, at) => {
      const value = metrics[at] === undefined ? null : pick(metrics[at]);
      return {
        key: session.workoutId,
        x: dayNumberOf(session.localDate),
        y: value === null ? null : weightInUnits(value, unitSystem),
        dayLabel: formatLocalDate(session.localDate, locale),
      };
    });
  return {
    metrics,
    topLoad: series((each) => each.topLoadKg),
    e1rm: series((each) => each.bestE1rmKg),
    volume: series((each) => each.volumeKg),
  };
}

/**
 * A chart value — already in the user's unit — as a quantity to print or speak. One decimal: an axis tick or an e1RM
 * reads "83,3 kg", not "83,33333 kg".
 */
export function chartQuantity(value: number, unitSystem: UnitSystem, locale: Locale): FormattedQuantity {
  return {
    text: formatDecimal(value, locale, { maxFractionDigits: 1 }),
    amount: roundForDisplay(value, 1),
    unit: weightUnitOf(unitSystem),
  };
}

/** Whether a series has anything to draw. */
export function hasValues(points: readonly LineChartPoint[]): boolean {
  return points.some((point) => point.y !== null);
}

/**
 * Which exercises are charted at all: the two that are measured in load (decision 6). A hold or a carry lists its time
 * and distance session by session, with no chart and no record, until task 010 decides those kinds (open question 15).
 */
export function isCharted(tracking: Tracking): boolean {
  return tracking === 'weight_reps' || tracking === 'reps_only';
}

/** A set as a line of text, in the user's units and language — the log, not a total. */
export function setLine(set: PerformedSet, tracking: Tracking, t: T, unitSystem: UnitSystem, locale: Locale): string {
  const blank = t('history.blank');
  const quantity = (formatted: { text: string; unit: string }) =>
    t('summary.quantity', { value: formatted.text, unit: t(`unit.${formatted.unit}`) });
  const line = t('history.set_line', {
    tracking,
    weight: set.weightKg === null ? blank : quantity(formatWeight(set.weightKg, unitSystem, locale)),
    reps: set.reps === null ? blank : t('summary.reps', { count: set.reps }),
    duration: set.durationS === null ? blank : formatDuration(set.durationS),
    distance: set.distanceM === null ? blank : quantity(formatShortDistance(set.distanceM, unitSystem, locale)),
  });
  // RIR exists only where reps do (task 004 stage 5c, decision 1); a blank one is said as not recorded, never 0 (INV-03).
  if (tracking !== 'weight_reps' && tracking !== 'reps_only') return line;
  return set.rir === null ? t('history.set_rir_none', { line }) : t('history.set_rir', { line, rir: set.rir });
}
