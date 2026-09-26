import { useState } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useT } from '../i18n/LocaleProvider';
import { useTheme } from '../theme/ThemeProvider';
import { radii, sizes, space, type HueToken } from '../tokens';
import { AppText } from './AppText';
import { latestWithValue, nearestPoint, plotChart, type ChartPoint } from './chartGeometry';

/** One point, with its day already written for the reader. */
export interface LineChartPoint extends ChartPoint {
  /** The day, in the user's language — `23/09/2026`. */
  readonly dayLabel: string;
}

interface LineChartProps {
  /** Already translated — "Top set". A single series needs no legend: the title names it. */
  readonly title: string;
  /** Oldest first, each value already in the user's unit (INV-01); null is a gap, never a zero (INV-03, INV-07). */
  readonly points: readonly LineChartPoint[];
  /** A value as the reader sees it — "100 kg". */
  readonly formatValue: (value: number) => string;
  /** The same value as a screen reader should say it — "100 kilograms". */
  readonly speakValue: (value: number) => string;
  /** The discipline hue the line is drawn in (07 §3). */
  readonly hue: HueToken;
}

/**
 * A single-series line over real dates — an exercise's history charts (task 004 stage 7, FR-2.14).
 *
 * Drawn to the dataviz conventions 07 §3 names: a 2 dp line in the discipline hue, recessive hairline gridlines at round
 * values, text in text tokens and never in the line's colour, and a point standing alone between gaps drawn as a dot
 * ringed in the surface colour. A missing value **breaks the line** — a set logged without RIR has no e1RM, and the
 * chart must not draw one at zero (INV-07).
 *
 * The readout above the plot is the tooltip: it starts on the latest point with a value, and a tap anywhere on the plot
 * moves it to the nearest session. It never gates a number — the session list under the charts holds every value. A
 * screen reader hears one element: a summary of the series, and the selected point as its value, moved with the
 * adjustable actions.
 */
export function LineChart({ title, points, formatValue, speakValue, hue }: LineChartProps) {
  const theme = useTheme();
  const t = useT();
  const [width, setWidth] = useState(0);
  // The widest axis value as laid out — measured rather than guessed, since it grows with the font scale (07 §8). The
  // line starts to its right, so the oldest point never runs through its own label (stage 7 device pass).
  const [labelWidth, setLabelWidth] = useState(0);
  // And the tallest, so the top value, standing on its gridline, stays inside the plot rather than over the readout.
  const [labelHeight, setLabelHeight] = useState(0);
  // Null follows the latest point, so a chart that gains a session still opens where the reader is.
  const [chosen, setChosen] = useState<number | null>(null);

  const plot = plotChart(points, {
    width,
    height: sizes.chartHeight,
    inset: sizes.chartDot + sizes.edgeSelected,
    gutter: labelWidth === 0 ? 0 : labelWidth + space[2],
    headroom: labelHeight,
  });
  const selected = Math.min(chosen ?? latestWithValue(points), points.length - 1);
  const point = points[selected];
  const place = plot.points[selected];
  const colour = theme.hue(hue, 1);

  const values = points.flatMap((each) => (each.y === null ? [] : [each.y]));
  const first = points[0];
  const last = points.at(-1);
  const summary =
    first === undefined || last === undefined
      ? title
      : t('ui.line_chart.summary', {
          title,
          count: points.length,
          first: first.dayLabel,
          last: last.dayLabel,
          has_values: values.length > 0 ? 'yes' : 'no',
          highest: values.length > 0 ? speakValue(Math.max(...values)) : '',
        });
  const readout = (spoken: boolean) =>
    point === undefined
      ? ''
      : t('ui.line_chart.readout', {
          day: point.dayLabel,
          value: point.y === null ? t('ui.line_chart.no_value') : spoken ? speakValue(point.y) : formatValue(point.y),
        });

  const move = (event: AccessibilityActionEvent) => {
    const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    setChosen(Math.max(0, Math.min(points.length - 1, selected + step)));
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.bgSurface }]}>
      <AppText variant="label" tone="textSecondary">
        {title}
      </AppText>
      <AppText variant="body">{readout(false)}</AppText>
      <Pressable
        testID="line-chart-plot"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={summary}
        accessibilityValue={{ text: readout(true) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={move}
        onPress={(event) => setChosen(nearestPoint(plot.points, event.nativeEvent.locationX))}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        style={styles.plot}
      >
        {width === 0 ? null : (
          <Svg width={width} height={sizes.chartHeight}>
            {plot.ticks.map((tick) => (
              <Line
                key={`grid:${String(tick.value)}`}
                x1={0}
                x2={width}
                y1={tick.y}
                y2={tick.y}
                stroke={theme.colors.borderSubtle}
                strokeWidth={sizes.edgeHairline}
              />
            ))}
            {place === undefined ? null : (
              <Line
                x1={place.cx}
                x2={place.cx}
                y1={0}
                y2={sizes.chartHeight}
                stroke={theme.colors.borderStrong}
                strokeWidth={sizes.edgeHairline}
              />
            )}
            {plot.segments.map((segment, at) => (
              <Path
                key={`segment:${String(at)}`}
                testID="line-chart-segment"
                d={segment}
                fill="none"
                stroke={colour}
                strokeWidth={sizes.edgeSelected}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {/* The selected point is ringed too — unless it is already a lone dot, which must not be drawn twice. */}
            {[
              ...plot.isolated,
              ...(place === undefined || place.cy === null || plot.isolated.includes(place) ? [] : [place]),
            ].map((dot) => (
              <Circle
                key={`dot:${dot.key}`}
                testID="line-chart-dot"
                cx={dot.cx}
                cy={dot.cy ?? 0}
                r={sizes.chartDot}
                fill={colour}
                stroke={theme.colors.bgSurface}
                strokeWidth={sizes.edgeSelected}
              />
            ))}
          </Svg>
        )}
        {/* The axis values sit on their gridlines, bottom edge on the line, so no text height has to be known. */}
        {plot.ticks.map((tick) => (
          <View
            key={`tick:${String(tick.value)}`}
            testID="line-chart-tick"
            pointerEvents="none"
            onLayout={(event: LayoutChangeEvent) => {
              const { width: wide, height: tall } = event.nativeEvent.layout;
              setLabelWidth((widest) => Math.max(widest, wide));
              setLabelHeight((tallest) => Math.max(tallest, tall));
            }}
            style={[styles.tick, { bottom: sizes.chartHeight - tick.y }]}
          >
            <AppText variant="caption" tone="textMuted">
              {formatValue(tick.value)}
            </AppText>
          </View>
        ))}
      </Pressable>
      {first === undefined || last === undefined ? null : (
        <View style={styles.days}>
          <AppText variant="caption" tone="textMuted">
            {first.dayLabel}
          </AppText>
          {last === first ? null : (
            <AppText variant="caption" tone="textMuted">
              {last.dayLabel}
            </AppText>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[2], padding: space[4], borderRadius: radii.lg },
  plot: { height: sizes.chartHeight },
  tick: { position: 'absolute', left: 0 },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
});
