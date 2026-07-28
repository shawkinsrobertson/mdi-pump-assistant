import { View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { COLORS } from '../lib/glucose';
import type { AgpBucket } from '../lib/trends/agp';

interface AgpChartProps {
  buckets: AgpBucket[]; // 48 half-hour buckets, minuteOfDay 0-1439, some may have no data
}

const WIDTH = 800;
const HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 24, left: 36 };
const MINUTES_PER_DAY = 24 * 60;

// Builds a closed "area between two curves" path from an upper and lower
// series over the same x positions, skipping buckets with no data —
// standard technique for a shaded percentile band.
function bandPath(
  points: Array<{ x: number; upper: number; lower: number }>,
): string {
  if (points.length === 0) return '';
  const forward = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.upper.toFixed(1)}`);
  const backward = [...points]
    .reverse()
    .map((p) => `L${p.x.toFixed(1)},${p.lower.toFixed(1)}`);
  return `${forward.join(' ')} ${backward.join(' ')} Z`;
}

function linePath(points: Array<{ x: number; y: number }>): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export function AgpChart({ buckets }: AgpChartProps) {
  const withData = buckets.filter((b) => b.count > 0 && b.p10 != null);
  if (withData.length === 0) return null;

  const allValues = withData.flatMap((b) => [b.p10!, b.p90!]);
  const minV = Math.min(40, ...allValues);
  const maxV = Math.max(260, ...allValues);

  const x = (minuteOfDay: number) =>
    PADDING.left + (minuteOfDay / MINUTES_PER_DAY) * (WIDTH - PADDING.left - PADDING.right);
  const y = (v: number) =>
    PADDING.top + (1 - (v - minV) / (maxV - minV)) * (HEIGHT - PADDING.top - PADDING.bottom);

  const outerBand = bandPath(withData.map((b) => ({ x: x(b.minuteOfDay), upper: y(b.p90!), lower: y(b.p10!) })));
  const innerBand = bandPath(withData.map((b) => ({ x: x(b.minuteOfDay), upper: y(b.p75!), lower: y(b.p25!) })));
  const medianLine = linePath(withData.map((b) => ({ x: x(b.minuteOfDay), y: y(b.p50!) })));

  return (
    <View style={{ width: '100%', aspectRatio: WIDTH / HEIGHT }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
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
          <SvgText key={`label-${v}`} x={PADDING.left - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill={COLORS.muted}>
            {v}
          </SvgText>
        ))}

        {[0, 6, 12, 18, 24].map((hour) => (
          <SvgText
            key={`hour-${hour}`}
            x={x(hour * 60)}
            y={HEIGHT - 6}
            textAnchor="middle"
            fontSize={10}
            fill={COLORS.muted}
          >
            {hour === 24 ? '24:00' : `${hour}:00`}
          </SvgText>
        ))}

        <Path d={outerBand} fill="rgba(37, 99, 235, 0.15)" />
        <Path d={innerBand} fill="rgba(37, 99, 235, 0.35)" />
        <Path d={medianLine} fill="none" stroke="#1e3a8a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
