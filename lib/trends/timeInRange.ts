import type { GlucoseReading } from '../glucose';

export interface TimeInRangeResult {
  belowPct: number;
  inRangePct: number;
  abovePct: number;
  // Distinct from the percentages above: callers use this to distinguish
  // "0% because there's no data yet" from "0% because it's genuinely
  // never low", same reasoning as insufficientGlucoseForCOB elsewhere.
  count: number;
}

const EMPTY_RESULT: TimeInRangeResult = { belowPct: 0, inRangePct: 0, abovePct: 0, count: 0 };

// Percent of readings below/within/above [low, high] (inclusive) over
// whatever window of readings the caller already fetched. Each bucket is
// rounded independently to the nearest whole percent (matching how CGM
// reports conventionally display this), so the three figures may not sum
// to exactly 100.
export function computeTimeInRange(readings: GlucoseReading[], low: number, high: number): TimeInRangeResult {
  if (readings.length === 0) return EMPTY_RESULT;

  let below = 0;
  let inRange = 0;
  let above = 0;
  for (const r of readings) {
    if (r.sgv < low) below++;
    else if (r.sgv > high) above++;
    else inRange++;
  }

  const count = readings.length;
  return {
    belowPct: Math.round((100 * below) / count),
    inRangePct: Math.round((100 * inRange) / count),
    abovePct: Math.round((100 * above) / count),
    count,
  };
}
