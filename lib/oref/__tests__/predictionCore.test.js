const {
  computePrediction,
  checkRequiredSettings,
  toPumpHistory,
  toCarbHistory,
  toGlucoseData,
} = require('../predictionCore');
const { DEFAULT_SETTINGS } = require('../../settings');

const COMPLETE_SETTINGS = {
  isf: 50,
  carbRatio: 10,
  targetBG: 115,
  dia: 4,
  penIncrement: 1,
  maxIOB: 5,
};

function readingAt(sgv, minutesAgo, now) {
  const date = now - minutesAgo * 60_000;
  return {
    sgv,
    date,
    dateString: new Date(date).toISOString(),
    delta: 0,
    direction: 'Flat',
    noise: 1,
    _id: `r${minutesAgo}`,
  };
}

// Flat, unchanging glucose history — deliberately simple so eventualBG
// ends up equal to the flat value (no trend to project), rather than
// hand-deriving oref0's own delta-averaging math in the fixture. Note:
// determine-basal.js has its own "CGM data is unchanged" stuck-sensor
// safety check that short-circuits with "doing nothing" given perfectly
// flat data over a long enough window — fine for the tests below that
// only check mealCOB/insufficientGlucoseForCOB, but not usable for
// exercising the MDI fork (see decliningGlucoseHistory).
function flatGlucoseHistory(sgv, points, now) {
  const readings = [];
  for (let i = 0; i < points; i++) {
    readings.push(readingAt(sgv, i * 5, now));
  }
  return readings;
}

// A gentle, genuinely-changing decline ending at `endSgv` now, going back
// `points` * 5-minute steps. Avoids determine-basal.js's stuck-sensor
// "CGM data is unchanged" guard while still giving a deterministic,
// currently-low-and-falling reading to feed the low-BG/MDI-fork branch.
function decliningGlucoseHistory(endSgv, points, now) {
  const readings = [];
  for (let i = 0; i < points; i++) {
    readings.push(readingAt(endSgv + i * 0.5, i * 5, now));
  }
  return readings;
}

describe('computePrediction', () => {
  it('reports which settings are missing rather than guessing', () => {
    const result = computePrediction({
      settings: DEFAULT_SETTINGS,
      glucoseReadings: [],
      treatments: [],
      basalDoses: [],
      now: new Date(),
    });
    expect(result.status).toBe('settings-incomplete');
    expect(result.missing).toEqual(['ISF', 'carb ratio', 'target BG', 'DIA', 'max IOB']);
  });

  it('refuses to guess with no glucose history at all', () => {
    const result = computePrediction({
      settings: COMPLETE_SETTINGS,
      glucoseReadings: [],
      treatments: [],
      basalDoses: [],
      now: new Date(),
    });
    expect(result).toEqual({ status: 'no-glucose-data' });
  });

  it('flags insufficient glucose data for COB (matching oref0-meal.js CLI behavior) with sparse history', () => {
    const now = Date.now();
    const result = computePrediction({
      settings: COMPLETE_SETTINGS,
      glucoseReadings: flatGlucoseHistory(115, 5, now), // well under the 36-point threshold
      treatments: [],
      basalDoses: [],
      now: new Date(now),
    });
    expect(result.status).toBe('ok');
    expect(result.insufficientGlucoseForCOB).toBe(true);
    expect(result.mealCOB).toBe(0);
  });

  it('does not flag insufficient COB data with a full 7h of history', () => {
    const now = Date.now();
    const result = computePrediction({
      settings: COMPLETE_SETTINGS,
      glucoseReadings: flatGlucoseHistory(115, 84, now), // 84 * 5min = 7h
      treatments: [],
      basalDoses: [],
      now: new Date(now),
    });
    expect(result.status).toBe('ok');
    expect(result.insufficientGlucoseForCOB).toBe(false);
  });

  it('runs the MDI fork end-to-end when a falling low BG and an active basal dose warrant it', () => {
    const now = Date.now();
    const result = computePrediction({
      settings: COMPLETE_SETTINGS,
      glucoseReadings: decliningGlucoseHistory(70, 84, now), // currently 70 and falling, well below target (115)
      treatments: [],
      basalDoses: [{ id: 1, type: 'glargine', units: 20, injectedAt: new Date(now - 5 * 3600_000).toISOString() }],
      now: new Date(now),
    });
    expect(result.status).toBe('ok');
    expect(result.currentBasal).toBeGreaterThan(0);
    expect(result.carbsSuggested).not.toBeNull();
    expect(result.mdiExcessInsulin).not.toBeNull();
    // The fork's own conversion: carbsSuggested = round(excessInsulin * carb_ratio, 1) — an
    // invariant check rather than a hand-derived magic number, since the exact insulinReq
    // is oref0's own math (already covered by the ported determine-basal tests).
    expect(result.carbsSuggested).toBeCloseTo(result.mdiExcessInsulin * COMPLETE_SETTINGS.carbRatio, 1);
  });

  it('does not trigger the MDI fork when BG is comfortably in range', () => {
    const now = Date.now();
    const result = computePrediction({
      settings: COMPLETE_SETTINGS,
      glucoseReadings: flatGlucoseHistory(115, 84, now), // flat, at target
      treatments: [],
      basalDoses: [{ id: 1, type: 'glargine', units: 20, injectedAt: new Date(now - 5 * 3600_000).toISOString() }],
      now: new Date(now),
    });
    expect(result.status).toBe('ok');
    expect(result.carbsSuggested).toBeNull();
    expect(result.mdiExcessInsulin).toBeNull();
  });

  // The Dashboard chart's dashed "leading" line (see GlucoseChart.tsx)
  // draws straight from determine-basal.js's own rT.predBGs — this just
  // confirms computePrediction actually surfaces that array rather than
  // dropping it. Uses the same declining-BG fixture as the MDI fork test
  // above rather than flat/unchanging glucose: determine-basal.js has its
  // own early "CGM data is unchanged, doing nothing" shortcut for a
  // perfectly flat feed that returns before predBGs is ever computed —
  // real, moving glucose is needed to reach the prediction step at all.
  it('surfaces the predicted BG curve (predBGs) for the Dashboard chart', () => {
    const now = Date.now();
    const result = computePrediction({
      settings: COMPLETE_SETTINGS,
      glucoseReadings: decliningGlucoseHistory(70, 84, now),
      treatments: [],
      basalDoses: [{ id: 1, type: 'glargine', units: 20, injectedAt: new Date(now - 5 * 3600_000).toISOString() }],
      now: new Date(now),
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(Array.isArray(result.predBGs)).toBe(true);
      expect(result.predBGs.length).toBeGreaterThan(0);
    }
  });
});

describe('autosens', () => {
  // A day-long trend with no logged boluses/carbs: since iob.activity is 0
  // throughout (no Bolus history), any sustained BG movement reads as
  // "unexplained" and drives the sensitivity ratio — the same "your basal
  // is the calibrated baseline" assumption oref0 makes for a pump's
  // scheduled basal applies equally to MDI's long-acting dose (see
  // computeAutosens's own comment in predictionCore.ts).
  // nowSgv is the current (most recent, i=0) reading; pastSgv is the value
  // ~24h ago. Interpolates linearly between them.
  function trendingGlucoseHistory(nowSgv, pastSgv, points, now) {
    const readings = [];
    for (let i = 0; i < points; i++) {
      const sgv = nowSgv + ((pastSgv - nowSgv) * i) / points;
      readings.push(readingAt(sgv, i * 5, now));
    }
    return readings;
  }

  it('detects sensitivity from a sustained unexplained decline and lowers the ratio', () => {
    const now = Date.now();
    const result = computePrediction({
      settings: COMPLETE_SETTINGS,
      glucoseReadings: trendingGlucoseHistory(100, 220, 288, now), // 24h, declining 220 -> 100, no insulin logged
      treatments: [],
      basalDoses: [{ id: 1, type: 'glargine', units: 20, injectedAt: new Date(now - 5 * 3600_000).toISOString() }],
      now: new Date(now),
    });
    expect(result.status).toBe('ok');
    expect(result.autosensInsufficientData).toBe(false);
    expect(result.autosensRatio).toBeCloseTo(0.89, 2);
    expect(result.autosensAdjustedISF).toBe(56); // ISF raised from 50 -> 56: less insulin needed per mg/dL
  });

  it('detects resistance from a sustained unexplained rise and raises the ratio', () => {
    const now = Date.now();
    const result = computePrediction({
      settings: COMPLETE_SETTINGS,
      glucoseReadings: trendingGlucoseHistory(220, 100, 288, now), // 24h, rising 100 -> 220, no insulin logged
      treatments: [],
      basalDoses: [{ id: 1, type: 'glargine', units: 20, injectedAt: new Date(now - 5 * 3600_000).toISOString() }],
      now: new Date(now),
    });
    expect(result.status).toBe('ok');
    expect(result.autosensInsufficientData).toBe(false);
    expect(result.autosensRatio).toBeCloseTo(1.11, 2);
    expect(result.autosensAdjustedISF).toBe(45); // ISF lowered from 50 -> 45: more insulin needed per mg/dL
  });

  it('skips autosens (neutral ratio) with less than 6h of glucose history, like oref0-detect-sensitivity.js\'s own CLI', () => {
    const now = Date.now();
    const result = computePrediction({
      settings: COMPLETE_SETTINGS,
      glucoseReadings: flatGlucoseHistory(100, 10, now), // well under the 72-point (6h) threshold
      treatments: [],
      basalDoses: [],
      now: new Date(now),
    });
    expect(result.status).toBe('ok');
    expect(result.autosensInsufficientData).toBe(true);
    expect(result.autosensRatio).toBe(1);
    expect(result.autosensAdjustedISF).toBeNull();
  });

  // Regression test: with >=72 glucose points (clearing the above
  // threshold) but no basal dose logged, currentBasal is 0 and
  // autosens.js normalizes its basal-effect deviation by
  // profile.max_daily_basal (== currentBasal — see computeAutosens's own
  // comment). That used to divide by zero, producing a NaN ratio that
  // poisoned ISF/deviation/eventualBG all the way through determine_basal
  // and surfaced only as an opaque "could not calculate eventualBG" error
  // — with no indication the real cause was "no basal logged yet," a
  // completely normal state for a user who hasn't taken today's shot yet.
  it('skips autosens (neutral ratio) with no basal dose logged, even with plenty of glucose history', () => {
    const now = Date.now();
    const result = computePrediction({
      settings: COMPLETE_SETTINGS,
      glucoseReadings: trendingGlucoseHistory(100, 220, 288, now), // well over the 72-point threshold
      treatments: [],
      basalDoses: [], // currentBasal === 0
      now: new Date(now),
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(Number.isFinite(result.eventualBG)).toBe(true);
      expect(result.currentBasal).toBe(0);
      expect(result.autosensInsufficientData).toBe(true);
      expect(result.autosensRatio).toBe(1);
      expect(result.autosensAdjustedISF).toBeNull();
    }
  });
});

describe('toPumpHistory', () => {
  it('maps insulin-bearing treatments to oref0 Bolus history entries, dropping carb-only rows', () => {
    const treatments = [
      { id: 1, eventType: 'Meal Bolus', insulin: 4, carbs: 30, createdAt: '2026-01-01T12:00:00.000Z' },
      { id: 2, eventType: 'Correction Bolus', insulin: 1.5, carbs: null, createdAt: '2026-01-01T13:00:00.000Z' },
      { id: 3, eventType: 'Meal Bolus', insulin: null, carbs: 20, createdAt: '2026-01-01T14:00:00.000Z' },
    ];
    expect(toPumpHistory(treatments)).toEqual([
      { _type: 'Bolus', amount: 4, timestamp: '2026-01-01T12:00:00.000Z' },
      { _type: 'Bolus', amount: 1.5, timestamp: '2026-01-01T13:00:00.000Z' },
    ]);
  });
});

describe('toCarbHistory', () => {
  it('maps carb-bearing treatments to oref0 meal history entries, dropping insulin-only rows', () => {
    const treatments = [
      { id: 1, eventType: 'Meal Bolus', insulin: 4, carbs: 30, createdAt: '2026-01-01T12:00:00.000Z' },
      { id: 2, eventType: 'Correction Bolus', insulin: 1.5, carbs: null, createdAt: '2026-01-01T13:00:00.000Z' },
    ];
    expect(toCarbHistory(treatments)).toEqual([{ carbs: 30, created_at: '2026-01-01T12:00:00.000Z' }]);
  });
});

describe('toGlucoseData', () => {
  it('sorts newest-first and carries both date and dateString', () => {
    const readings = [
      { sgv: 100, date: 1000, dateString: 'a', delta: 0, direction: 'Flat', noise: 1, _id: '1' },
      { sgv: 110, date: 3000, dateString: 'b', delta: 0, direction: 'Flat', noise: 1, _id: '2' },
      { sgv: 105, date: 2000, dateString: 'c', delta: 0, direction: 'Flat', noise: 1, _id: '3' },
    ];
    const result = toGlucoseData(readings);
    expect(result.map((r) => r.date)).toEqual([3000, 2000, 1000]);
    expect(result[0]).toEqual({ date: 3000, dateString: new Date(3000).toISOString(), glucose: 110 });
  });
});

describe('checkRequiredSettings', () => {
  it('returns the assembled values when everything is present', () => {
    const result = checkRequiredSettings(COMPLETE_SETTINGS);
    expect(result).toEqual({ isf: 50, carbRatio: 10, targetBG: 115, dia: 4, maxIOB: 5 });
  });
});
