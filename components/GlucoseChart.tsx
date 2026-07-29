import { View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { bgColor, COLORS } from '../lib/glucose';
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
  history: ChartPoint[]; // oldest → newest
  markers?: ChartMarker[]; // logged Quick Actions within the visible window
}

const WIDTH = 800;
const HEIGHT = 280;
const PADDING = { top: 24, right: 24, bottom: 32, left: 40 };
const MARKER_SIZE = 7;

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

export function GlucoseChart({ history, markers = [] }: GlucoseChartProps) {
  if (history.length === 0) return null;

  const last = history[history.length - 1];
  const minT = history[0].time;
  const maxT = last.time;
  const vals = history.map((p) => p.sgv);
  const minV = Math.min(40, ...vals);
  const maxV = Math.max(260, ...vals);

  const x = (t: number) =>
    PADDING.left + ((t - minT) / Math.max(1, maxT - minT)) * (WIDTH - PADDING.left - PADDING.right);
  const y = (v: number) =>
    PADDING.top + (1 - (v - minV) / (maxV - minV)) * (HEIGHT - PADDING.top - PADDING.bottom);
  const markerBaselineY = HEIGHT - PADDING.bottom - 6;
  const visibleMarkers = markers.filter((m) => m.time >= minT && m.time <= maxT);

  const linePath = history
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.time).toFixed(1)},${y(p.sgv).toFixed(1)}`)
    .join(' ');

  const lineColor = bgColor(last.sgv);
  const bands = [
    { from: 70, to: 180, color: COLORS.bandIn },
    { from: 55, to: 70, color: COLORS.bandWarn },
    { from: 180, to: 250, color: COLORS.bandWarn },
  ];

  return (
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
            y={y(v) + 3}
            textAnchor="end"
            fontSize={10}
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

        <Circle cx={x(last.time)} cy={y(last.sgv)} r={5} fill={lineColor} />

        {visibleMarkers.map((m, i) => (
          <MarkerShapeGlyph key={`marker-${i}`} shape={m.shape} cx={x(m.time)} cy={markerBaselineY} color={m.color} />
        ))}
      </Svg>
    </View>
  );
}
