const { basalRateFromDose, currentBasalRate } = require('../basalCurve');

function integrateDose(type, units, durationHours, customDurationHours) {
  const injectedAt = new Date('2026-01-01T00:00:00.000Z');
  const dose = { type, units, injectedAt: injectedAt.toISOString(), customDurationHours };
  const stepMinutes = 1;
  const steps = Math.round((durationHours * 60) / stepMinutes);
  let auc = 0;
  for (let i = 0; i <= steps; i++) {
    const t = new Date(injectedAt.getTime() + i * stepMinutes * 60_000);
    auc += basalRateFromDose(dose, t) * (stepMinutes / 60);
  }
  return auc;
}

describe('basalCurve', () => {
  it('glargine activity curve integrates to the full dose', () => {
    expect(integrateDose('glargine', 2, 24)).toBeCloseTo(2, 1);
  });

  it('detemir activity curve integrates to the full dose', () => {
    expect(integrateDose('detemir', 10, 20)).toBeCloseTo(10, 0);
  });

  it('degludec activity curve integrates to the full dose', () => {
    expect(integrateDose('degludec', 15, 42)).toBeCloseTo(15, 0);
  });

  it('rate is 0 before the injection time', () => {
    const dose = { type: 'glargine', units: 10, injectedAt: '2026-01-01T00:00:00.000Z' };
    expect(basalRateFromDose(dose, new Date('2025-12-31T23:00:00.000Z'))).toBe(0);
  });

  it('rate is 0 after the duration has elapsed', () => {
    const dose = { type: 'glargine', units: 10, injectedAt: '2026-01-01T00:00:00.000Z' };
    expect(basalRateFromDose(dose, new Date('2026-01-02T01:00:00.000Z'))).toBe(0);
  });

  it('currentBasalRate sums contributions from overlapping doses', () => {
    const doses = [
      { type: 'glargine', units: 10, injectedAt: '2026-01-01T00:00:00.000Z' },
      { type: 'glargine', units: 10, injectedAt: '2026-01-02T00:00:00.000Z' },
    ];
    const at = new Date('2026-01-02T01:00:00.000Z');
    const summed = currentBasalRate(doses, at);
    const individual = basalRateFromDose(doses[0], at) + basalRateFromDose(doses[1], at);
    expect(summed).toBeCloseTo(individual, 9);
  });

  it('detemir peaks higher than its own flat-equivalent average rate', () => {
    const dose = { type: 'detemir', units: 10, injectedAt: '2026-01-01T00:00:00.000Z' };
    const peakRate = basalRateFromDose(dose, new Date('2026-01-01T06:00:00.000Z')); // peakFraction 0.3 * 20h = 6h
    expect(peakRate).toBeGreaterThan(10 / 20);
  });

  it("'other' type uses the dose's own customDurationHours, not the 24h fallback profile", () => {
    // Integrating over the fallback's 24h would miss activity still
    // happening between 24h and the real 30h duration if the override
    // weren't actually being used.
    expect(integrateDose('other', 8, 30, 30)).toBeCloseTo(8, 1);
  });

  it("'other' type dose is inactive past its own customDurationHours even though it's within the 24h fallback", () => {
    const dose = { type: 'other', units: 8, injectedAt: '2026-01-01T00:00:00.000Z', customDurationHours: 10 };
    // 15h in: past the real 10h duration, but still inside the generic 24h fallback profile
    expect(basalRateFromDose(dose, new Date('2026-01-01T15:00:00.000Z'))).toBe(0);
  });
});
