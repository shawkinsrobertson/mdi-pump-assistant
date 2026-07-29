const { computeInsightPayload } = require('../insightPayload');

function reading(sgv, date) {
  return { sgv, date, dateString: new Date(date).toISOString(), delta: 0, direction: 'Flat', noise: 0, _id: String(date) };
}

function treatment(overrides) {
  return { id: 1, eventType: 'Meal Bolus', insulin: null, carbs: null, createdAt: new Date().toISOString(), notes: null, ...overrides };
}

const BASE_INPUTS = {
  now: new Date('2026-07-29T12:00:00Z'),
  windowDays: 7,
  glucoseReadings: [],
  treatments: [],
  activities: [],
  notes: [],
  rangeLow: 70,
  rangeHigh: 180,
};

describe('computeInsightPayload', () => {
  it('returns all zeros/nulls with no data, distinguishable from genuine zeros', () => {
    const result = computeInsightPayload(BASE_INPUTS);
    expect(result.readingCount).toBe(0);
    expect(result.timeInRange).toEqual({ belowPct: 0, inRangePct: 0, abovePct: 0, count: 0 });
    expect(result.glucoseSummary).toBeNull();
    expect(result.severeLowCount).toBe(0);
    expect(result.severeHighCount).toBe(0);
    expect(result.overnightLowPct).toBeNull();
    expect(result.treatmentsLogged).toEqual({ carbEntries: 0, insulinEntries: 0, activityEntries: 0, noteEntries: 0 });
  });

  it('counts severe lows (<54) and severe highs (>250) using the published consensus thresholds', () => {
    const readings = [
      reading(53, new Date('2026-07-29T09:00:00').getTime()), // severe low
      reading(54, new Date('2026-07-29T09:05:00').getTime()), // boundary — not severe
      reading(251, new Date('2026-07-29T09:10:00').getTime()), // severe high
      reading(250, new Date('2026-07-29T09:15:00').getTime()), // boundary — not severe
      reading(120, new Date('2026-07-29T09:20:00').getTime()), // in range
    ];
    const result = computeInsightPayload({ ...BASE_INPUTS, glucoseReadings: readings });
    expect(result.readingCount).toBe(5);
    expect(result.severeLowCount).toBe(1);
    expect(result.severeHighCount).toBe(1);
  });

  it('computes overnightLowPct only from midnight-6am readings, distinct from the daytime range', () => {
    const readings = [
      reading(60, new Date('2026-07-29T02:00:00').getTime()), // overnight, below rangeLow=70
      reading(75, new Date('2026-07-29T03:00:00').getTime()), // overnight, in range
      reading(50, new Date('2026-07-29T14:00:00').getTime()), // daytime low — must not count toward overnightLowPct
    ];
    const result = computeInsightPayload({ ...BASE_INPUTS, glucoseReadings: readings });
    // 1 of 2 overnight readings below rangeLow
    expect(result.overnightLowPct).toBe(50);
  });

  it('counts carb vs insulin treatment entries independently, plus activities/notes', () => {
    const treatments = [
      treatment({ carbs: 30, insulin: null }),
      treatment({ carbs: null, insulin: 4 }),
      treatment({ carbs: 15, insulin: 2 }), // counts toward both
    ];
    const activities = [{ id: 1, intensity: 'low', durationMinutes: 20, loggedAt: new Date().toISOString() }];
    const notes = [
      { id: 1, text: 'felt shaky', loggedAt: new Date().toISOString() },
      { id: 2, text: 'good day', loggedAt: new Date().toISOString() },
    ];
    const result = computeInsightPayload({ ...BASE_INPUTS, treatments, activities, notes });
    expect(result.treatmentsLogged).toEqual({
      carbEntries: 2,
      insulinEntries: 2,
      activityEntries: 1,
      noteEntries: 2,
    });
  });
});
