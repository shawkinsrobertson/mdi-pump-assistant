import { Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { bgColor, COLORS } from '../lib/glucose';
import { formatTime } from '../lib/time';
import type { TimeFormat } from '../lib/ThemeContext';
import type { MarkerShape } from '../lib/theme';

export interface ChartPoint {
  time: number; // epoch ms
  sgv: number;
}

export interface ChartMarker {
  time: number; // epoch ms
  color: string;
  shape: MarkerShape;
}

interface GlucoseChartProps {
  history: ChartPoint[]; // oldest → newest, already trimmed to the selected window
  markers?: ChartMarker[]; // logged Quick Actions within the visible window
  predicted?: ChartPoint[]; // oldest → newest forward projection (oref0 predBGs), drawn dashed past the last real reading
  windowHours: number; // drives the x-axis span and gridline interval
  timeFormat?: TimeFormat; // for gridline time labels
  onPress?: () => void; // tap-to-cycle window size
}

const WIDTH = 800;
const HEIGHT = 280;
const PADDING = { top: 24, right: 24, bottom: 32, left: 46 };
const MARKER_SIZE = 7;

// Vertical gridline spacing, keyed by the selected window — wider windows
// use coarser intervals so labels never crowd together, while the 3h
// default gets the fine-grained 30-minute marks the user asked for.
const GRID_INTERVAL_MIN: Record<number, number> = { 3: 30, 6: 60, 12: 120, 24: 240 };

// Renders each Quick Action marker shape at a fixed baseline just above
// the x-axis, rather than at its glucose value — keeps markers legible
// regardless of where the BG line is at that moment.
function MarkerShapeGlyph({ shape, cx, cy, color }: { shape: MarkerShape; cx: number; cy: number; color: string }) {
  switch (shape) {
    case 'circle':
      return <Circle cx={cx} cy={cy} r={MARKER_SIZE / 2} fill={color} />;
    case 'square':
      return <Rect x={cx - MARKER_SIZE / 2} y={cy - MARKER_SIZE / 2} width={MARKER_SIZE} height={MARKER_SIZE} fill={color} />;
    case 'diamond':
      return (
        <Polygon
          points={`${cx},${cy - MARKER_SIZE / 2} ${cx + MARKER_SIZE / 2},${cy} ${cx},${cy + MARKER_SIZE / 2} ${cx - MARKER_SIZE / 2},${cy}`}
          fill={color}
        />
      );
    case 'triangle':
      return (
        <Polygon
          points={`${cx},${cy - MARKER_SIZE / 2} ${cx + MARKER_SIZE / 2},${cy + MARKER_SIZE / 2} ${cx - MARKER_SIZE / 2},${cy + MARKER_SIZE / 2}`}
          fill={color}
        />
      );
  }
}

export function GlucoseChart({
  history,
  markers = [],
  predicted = [],
  windowHours,
  timeFormat = '12h',
  onPress,
}: GlucoseChartProps) {
  if (history.length === 0) return null;

  const last = history[history.length - 1];

  // Fixed timeline anchored to "now" rather than to the data's own extent —
  // this is what keeps gridlines at stable 30/60/120/240-minute marks
  // instead of drifting with whatever the latest reading happens to be,
  // and leaves room on the right for the dashed prediction line to lead
  // past the last real reading.
  const now = Date.now();
  const minT = now - windowHours * 60 * 60 * 1000;
  const lastPredicted = predicted.length > 0 ? predicted[predicted.length - 1].time : now;
  const maxT = Math.max(now, lastPredicted);

  const visibleHistory = history.filter((p) => p.time >= minT && p.time <= maxT);
  const vals = [...visibleHistory.map((p) => p.sgv), ...predicted.map((p) => p.sgv)];
  const minV = Math.min(40, ...vals);
  const maxV = Math.max(260, ...vals);

  const x = (t: number) =>
    PADDING.left + ((t - minT) / Math.max(1, maxT - minT)) * (WIDTH - PADDING.left - PADDING.right);
  const y = (v: number) =>
    PADDING.top + (1 - (v - minV) / (maxV - minV)) * (HEIGHT - PADDING.top - PADDING.bottom);
  const markerBaselineY = HEIGHT - PADDING.bottom - 6;
  const visibleMarkers = markers.filter((m) => m.time >= minT && m.time <= maxT);

  const linePath = visibleHistory
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.time).toFixed(1)},${y(p.sgv).toFixed(1)}`)
    .join(' ');

  // The dashed line should lead on from the last real point rather than
  // start floating in space, so it's prefixed with `last` even though
  // `predicted` itself is oref0's own projection from that same point.
  const predictedPath =
    predicted.length > 0
      ? [last, ...predicted]
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.time).toFixed(1)},${y(p.sgv).toFixed(1)}`)
          .join(' ')
      : '';

  const lineColor = bgColor(last.sgv);
  const bands = [
    { from: 70, to: 180, color: COLORS.bandIn },
    { from: 55, to: 70, color: COLORS.bandWarn },
    { from: 180, to: 250, color: COLORS.bandWarn },
  ];

  const gridIntervalMs = (GRID_INTERVAL_MIN[windowHours] ?? 60) * 60 * 1000;
  const firstGridT = Math.ceil(minT / gridIntervalMs) * gridIntervalMs;
  const timeGridlines: number[] = [];
  for (let t = firstGridT; t <= maxT; t += gridIntervalMs) {
    timeGridlines.push(t);
  }

  const chart = (
    <View style={{ width: '100%', aspectRatio: WIDTH / HEIGHT }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        {bands.map((b) => (
          <Rect
            key={`${b.from}-${b.to}`}
            x={PADDING.left}
            y={y(b.to)}
            width={WIDTH - PADDING.left - PADDING.right}
            height={y(b.from) - y(b.to)}
            fill={b.color}
          />
        ))}

        {timeGridlines.map((t) => (
          <Line
            key={`vgrid-${t}`}
            x1={x(t)}
            x2={x(t)}
            y1={PADDING.top}
            y2={HEIGHT - PADDING.bottom}
            stroke={COLORS.grid}
            strokeDasharray="2 4"
            strokeWidth={1}
          />
        ))}
        {timeGridlines.map((t) => (
          <SvgText
            key={`vlabel-${t}`}
            x={x(t)}
            y={HEIGHT - PADDING.bottom + 16}
            textAnchor="middle"
            fontSize={10}
            fill={COLORS.muted}
          >
            {formatTime(new Date(t), timeFormat)}
          </SvgText>
        ))}

        {[70, 180].map((v) => (
          <Line
            key={`grid-${v}`}
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={y(v)}
            y2={y(v)}
            stroke={COLORS.grid}
            strokeDasharray="2 4"
            strokeWidth={1}
          />
        ))}
        {[70, 180].map((v) => (
          <SvgText
            key={`label-${v}`}
            x={PADDING.left - 6}
            y={y(v) + 5}
            textAnchor="end"
            fontSize={14}
            fontWeight="600"
            fill={COLORS.muted}
          >
            {v}
          </SvgText>
        ))}

        <Path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {predictedPath !== '' && (
          <Path
            d={predictedPath}
            fill="none"
            stroke={lineColor}
            strokeWidth={2.5}
            strokeDasharray="6 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.6}
          />
        )}

        <Circle cx={x(last.time)} cy={y(last.sgv)} r={5} fill={lineColor} />

        {visibleMarkers.map((m, i) => (
          <MarkerShapeGlyph key={`marker-${i}`} shape={m.shape} cx={x(m.time)} cy={markerBaselineY} color={m.color} />
        ))}
      </Svg>
    </View>
  );

  if (!onPress) return chart;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Change chart time window">
      {chart}
    </Pressable>
  );
}
