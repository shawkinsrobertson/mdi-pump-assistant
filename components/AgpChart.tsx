import { View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { withAlpha, type ThemeColors } from '../lib/theme';
import type { AgpBucket } from '../lib/trends/agp';

interface AgpChartProps {
  buckets: AgpBucket[]; // 48 half-hour buckets, minuteOfDay 0-1439, some may have no data
  colors: ThemeColors; // resolved light/dark theme, from the caller's useTheme()
}

const WIDTH = 800;
const HEIGHT = 340;
const PADDING = { top: 20, right: 20, bottom: 32, left: 44 };
const MINUTES_PER_DAY = 24 * 60;
const LABEL_FONT_SIZE = 14;

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

export function AgpChart({ buckets, colors }: AgpChartProps) {
  const withData = buckets.filter((b) => b.count > 0 && b.p10 != null);
  if (withData.length === 0) return null;

  // Pad the y-domain around the actual data range (rather than forcing a
  // fixed 40-260 window) so a typical, narrower glucose range doesn't
  // render as a thin band lost in a mostly-empty chart.
  const allValues = withData.flatMap((b) => [b.p10!, b.p90!]);
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  const pad = Math.max(15, (dataMax - dataMin) * 0.2);
  const minV = Math.max(20, dataMin - pad);
  const maxV = Math.min(400, dataMax + pad);

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
        {[70, 180].filter((v) => v >= minV && v <= maxV).map((v) => (
          <Line
            key={`grid-${v}`}
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={y(v)}
            y2={y(v)}
            stroke={colors.chart.grid}
            strokeDasharray="2 4"
            strokeWidth={1}
          />
        ))}
        {[70, 180].filter((v) => v >= minV && v <= maxV).map((v) => (
          <SvgText
            key={`label-${v}`}
            x={PADDING.left - 6}
            y={y(v) + 4}
            textAnchor="end"
            fontSize={LABEL_FONT_SIZE}
            fill={colors.chart.muted}
          >
            {v}
          </SvgText>
        ))}

        {[0, 6, 12, 18, 24].map((hour) => (
          <SvgText
            key={`hour-${hour}`}
            x={x(hour * 60)}
            y={HEIGHT - 8}
            textAnchor="middle"
            fontSize={LABEL_FONT_SIZE}
            fill={colors.chart.muted}
          >
            {hour === 24 ? '24:00' : `${hour}:00`}
          </SvgText>
        ))}

        <Path d={outerBand} fill={withAlpha(colors.accent.info, 0.15)} />
        <Path d={innerBand} fill={withAlpha(colors.accent.info, 0.35)} />
        <Path d={medianLine} fill="none" stroke={colors.accent.info} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
