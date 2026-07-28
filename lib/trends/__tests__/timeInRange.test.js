const { computeTimeInRange } = require('../timeInRange');

function reading(sgv) {
  return { sgv, date: 0, dateString: '', delta: 0, direction: 'Flat', noise: 0, _id: String(Math.random()) };
}

describe('computeTimeInRange', () => {
  it('returns all zeros with no readings, distinguishable via count', () => {
    const result = computeTimeInRange([], 70, 180);
    expect(result).toEqual({ belowPct: 0, inRangePct: 0, abovePct: 0, count: 0 });
  });

  it('buckets below/in-range/above using inclusive boundaries', () => {
    const readings = [reading(70), reading(180), reading(69), reading(181), reading(120)];
    const result = computeTimeInRange(readings, 70, 180);
    // 70 and 180 are in-range (inclusive); 69 below; 181 above
    expect(result.count).toBe(5);
    expect(result.belowPct).toBe(20); // 1/5
    expect(result.abovePct).toBe(20); // 1/5
    expect(result.inRangePct).toBe(60); // 3/5
  });

  it('reports 100% in range when every reading is within range', () => {
    const readings = [reading(90), reading(100), reading(150)];
    const result = computeTimeInRange(readings, 70, 180);
    expect(result).toEqual({ belowPct: 0, inRangePct: 100, abovePct: 0, count: 3 });
  });

  it('respects custom thresholds', () => {
    const readings = [reading(60), reading(65), reading(200)];
    const result = computeTimeInRange(readings, 65, 150);
    expect(result.belowPct).toBe(33); // just the 60
    expect(result.inRangePct).toBe(33); // just the 65
    expect(result.abovePct).toBe(33); // just the 200
  });
});
