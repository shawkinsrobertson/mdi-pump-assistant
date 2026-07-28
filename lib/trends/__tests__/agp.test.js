const { computeAgpBuckets, computeAgpSummary } = require('../agp');

// Builds a reading at a specific hour:minute of an arbitrary fixed day
// (only time-of-day matters for bucketing, not the calendar date).
function readingAt(hour, minute, sgv) {
  const date = new Date(2026, 0, 1, hour, minute, 0).getTime();
  return { sgv, date, dateString: new Date(date).toISOString(), delta: 0, direction: 'Flat', noise: 0, _id: `${hour}:${minute}` };
}

describe('computeAgpBuckets', () => {
  it('returns 48 half-hour buckets, all empty for no readings', () => {
    const buckets = computeAgpBuckets([]);
    expect(buckets).toHaveLength(48);
    expect(buckets[0]).toEqual({ minuteOfDay: 0, p10: null, p25: null, p50: null, p75: null, p90: null, count: 0 });
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  it('groups readings by time-of-day regardless of calendar date', () => {
    const readings = [
      { ...readingAt(8, 0, 100), date: new Date(2026, 0, 1, 8, 0).getTime() },
      { ...readingAt(8, 0, 120), date: new Date(2026, 0, 5, 8, 10).getTime() }, // different day, same 30m bucket
    ];
    const buckets = computeAgpBuckets(readings);
    const bucket8am = buckets.find((b) => b.minuteOfDay === 8 * 60);
    expect(bucket8am.count).toBe(2);
    expect(bucket8am.p50).toBeCloseTo(110, 5); // median of [100, 120]
  });

  it('computes percentiles within a bucket', () => {
    const readings = [10, 20, 30, 40, 50].map((sgv, i) => readingAt(12, i, sgv));
    const buckets = computeAgpBuckets(readings);
    const noon = buckets.find((b) => b.minuteOfDay === 12 * 60);
    expect(noon.count).toBe(5);
    expect(noon.p50).toBe(30);
    expect(noon.p10).toBeCloseTo(14, 5);
    expect(noon.p90).toBeCloseTo(46, 5);
  });

  it('assigns the last bucket to readings right at the end of the day', () => {
    const readings = [readingAt(23, 59, 100)];
    const buckets = computeAgpBuckets(readings);
    expect(buckets[buckets.length - 1].count).toBe(1);
  });
});

describe('computeAgpSummary', () => {
  it('returns null for no readings', () => {
    expect(computeAgpSummary([])).toBeNull();
  });

  it('computes median/mean/stdDev/estimatedA1c', () => {
    const readings = [100, 120, 140, 160, 180].map((sgv, i) => readingAt(0, i, sgv));
    const summary = computeAgpSummary(readings);
    expect(summary.count).toBe(5);
    expect(summary.mean).toBe(140);
    expect(summary.median).toBe(140);
    // population stdDev of [100,120,140,160,180]: deviations ±40,±20,0;
    // mean squared deviation = (1600+400+0+400+1600)/5 = 800; sqrt(800) ≈ 28.28
    expect(summary.stdDev).toBeCloseTo(28.28, 1);
    // eAG formula: A1c = (mean + 46.7) / 28.7
    expect(summary.estimatedA1c).toBeCloseTo((140 + 46.7) / 28.7, 1);
  });

  it('reports zero stdDev when all readings are identical', () => {
    const readings = [150, 150, 150].map((sgv, i) => readingAt(0, i, sgv));
    const summary = computeAgpSummary(readings);
    expect(summary.stdDev).toBe(0);
    expect(summary.mean).toBe(150);
  });
});
