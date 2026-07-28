import type { GlucoseReading } from '../glucose';

// Ambulatory Glucose Profile: buckets readings across the selected day
// range by time-of-day (ignoring which calendar day each came from) and
// computes percentile bands per bucket — the standard AGP methodology
// (Battelino et al. 2019 international consensus report), not something
// invented here.

const BUCKET_MINUTES = 30;
const BUCKETS_PER_DAY = (24 * 60) / BUCKET_MINUTES; // 48

export interface AgpBucket {
  minuteOfDay: number; // start of this bucket, 0-1439
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  count: number;
}

export interface AgpSummary {
  median: number;
  mean: number;
  stdDev: number;
  estimatedA1c: number; // %
  count: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function minuteOfDay(dateMs: number): number {
  const d = new Date(dateMs);
  return d.getHours() * 60 + d.getMinutes();
}

// Linear-interpolation percentile (matches numpy's default / the common
// "R-7" method) over an already-sorted array.
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = (p / 100) * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  const frac = idx - lo;
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * frac;
}

export function computeAgpBuckets(readings: GlucoseReading[]): AgpBucket[] {
  const buckets: number[][] = Array.from({ length: BUCKETS_PER_DAY }, () => []);
  for (const r of readings) {
    const idx = Math.min(BUCKETS_PER_DAY - 1, Math.floor(minuteOfDay(r.date) / BUCKET_MINUTES));
    buckets[idx].push(r.sgv);
  }

  return buckets.map((values, i) => {
    const minuteOfBucket = i * BUCKET_MINUTES;
    if (values.length === 0) {
      return { minuteOfDay: minuteOfBucket, p10: null, p25: null, p50: null, p75: null, p90: null, count: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    return {
      minuteOfDay: minuteOfBucket,
      p10: round1(percentile(sorted, 10)),
      p25: round1(percentile(sorted, 25)),
      p50: round1(percentile(sorted, 50)),
      p75: round1(percentile(sorted, 75)),
      p90: round1(percentile(sorted, 90)),
      count: values.length,
    };
  });
}

// Whole-window summary stats — a single number each, toggled between in
// the UI (matching the mockup's Median/Mean/Std. Dev./Est. A1c buttons),
// not per-bucket.
export function computeAgpSummary(readings: GlucoseReading[]): AgpSummary | null {
  if (readings.length === 0) return null;

  const values = readings.map((r) => r.sgv);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const sorted = [...values].sort((a, b) => a - b);
  const median = percentile(sorted, 50);

  // Estimated A1c via the ADAG study formula (Nathan et al. 2008,
  // "Translating the A1C assay into estimated average glucose values"):
  // eAG(mg/dL) = 28.7 * A1c - 46.7. A published, widely-used conversion,
  // not an invented one.
  const estimatedA1c = (mean + 46.7) / 28.7;

  return {
    median: round1(median),
    mean: round1(mean),
    stdDev: round1(stdDev),
    estimatedA1c: round1(estimatedA1c),
    count: values.length,
  };
}
