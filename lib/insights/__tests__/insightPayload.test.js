const { computeInsightPayload } = require('../insightPayload');

function reading(sgv, date) {
  return { sgv, date, dateString: new Date(date).toISOString(), delta: 0, direction: 'Flat', noise: 0, _id: String(date) };
}

function treatment(overrides) {
  return { id: 1, eventType: 'Meal Bolus', insulin: null, carbs: null, createdAt: new Date().toISOString(), notes: null, ...overrides };
}

function nightscoutTreatment(overrides) {
  return { id: 'ns1', eventType: 'Meal Bolus', insulin: null, carbs: null, createdAt: new Date().toISOString(), notes: null, ...overrides };
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
  healthSyncEnabled: false,
  dailySteps: [],
  healthActivities: [],
  healthNutrition: [],
  nightscoutTreatments: [],
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
    expect(result.importedHealthData).toBeNull();
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

  it('combines local and Nightscout treatments into the same counts, not a separate block', () => {
    // Deliberate: for a pump user, local `treatments` is normally empty
    // (they treat from their pump, not this app) and Nightscout is the
    // real record; for an MDI user it's the reverse. One real treatment
    // history either way, not two to reconcile — see AGENTS.md/the
    // conversation this decision came from.
    const treatments = [treatment({ carbs: 30, insulin: 2 })];
    const nightscoutTreatments = [
      nightscoutTreatment({ carbs: 45, insulin: 3 }), // manual pump-app entry
      nightscoutTreatment({ carbs: null, insulin: 1, eventType: 'Correction Bolus' }), // automatic loop action
      nightscoutTreatment({ eventType: 'Temp Basal', carbs: null, insulin: null }), // non-bolus NS treatment type — must not count
    ];
    const result = computeInsightPayload({ ...BASE_INPUTS, treatments, nightscoutTreatments });
    expect(result.treatmentsLogged.carbEntries).toBe(2); // 1 local + 1 NS
    expect(result.treatmentsLogged.insulinEntries).toBe(3); // 1 local + 2 NS
  });
});

describe('importedHealthData', () => {
  it('is null when Health sync is disabled, even if some data was passed in', () => {
    // Shouldn't happen in practice (buildInsightPayload.ts only queries
    // these tables when enabled), but the pure function's own contract is
    // that "not opted in" always wins over whatever data happens to be
    // present — never a silent partial summary.
    const result = computeInsightPayload({
      ...BASE_INPUTS,
      healthSyncEnabled: false,
      dailySteps: [{ dayKey: '2026-07-28', count: 5000 }],
    });
    expect(result.importedHealthData).toBeNull();
  });

  it('summarizes an enabled-but-empty week as zeros, distinct from disabled (null)', () => {
    const result = computeInsightPayload({ ...BASE_INPUTS, healthSyncEnabled: true });
    expect(result.importedHealthData).toEqual({
      dailySteps: [],
      activitySessionCount: 0,
      activityMinutesTotal: 0,
      activityTypes: [],
      nutritionEntryCount: 0,
      nutritionCarbsGramsTotal: 0,
    });
  });

  it('aggregates activity minutes/types and nutrition carbs, deduping activity type names', () => {
    const healthActivities = [
      { source: 'healthkit', externalId: 'a1', title: 'Running', durationMinutes: 30, calories: 250, startTime: 1, endTime: 2 },
      { source: 'healthkit', externalId: 'a2', title: 'Running', durationMinutes: 45, calories: 300, startTime: 3, endTime: 4 },
      { source: 'healthkit', externalId: 'a3', title: 'Cycling', durationMinutes: 60, calories: null, startTime: 5, endTime: 6 },
    ];
    const healthNutrition = [
      { source: 'healthkit', externalId: 'n1', carbsGrams: 40, loggedAt: 1 },
      { source: 'healthkit', externalId: 'n2', carbsGrams: 22.5, loggedAt: 2 },
    ];
    const dailySteps = [{ dayKey: '2026-07-28', count: 8000 }, { dayKey: '2026-07-29', count: 6200 }];

    const result = computeInsightPayload({
      ...BASE_INPUTS,
      healthSyncEnabled: true,
      dailySteps,
      healthActivities,
      healthNutrition,
    });

    expect(result.importedHealthData).toEqual({
      dailySteps,
      activitySessionCount: 3,
      activityMinutesTotal: 135,
      activityTypes: ['Running', 'Cycling'],
      nutritionEntryCount: 2,
      nutritionCarbsGramsTotal: 63, // rounded from 62.5
    });
  });
});
