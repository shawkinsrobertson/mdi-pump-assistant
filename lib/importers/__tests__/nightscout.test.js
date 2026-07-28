const { parseNightscoutEntries, parseNightscoutTreatments } = require('../nightscout');

describe('parseNightscoutEntries', () => {
  it('maps sgv entries to GlucoseReading, using created_at as dateString', () => {
    const raw = [
      {
        _id: '6a69020dcce981a89c2b209f',
        date: 1785266699378,
        sgv: 84,
        direction: 'Flat',
        noise: 84,
        type: 'sgv',
        created_at: '2026-07-28T19:24:59.378Z',
      },
    ];
    expect(parseNightscoutEntries(raw)).toEqual([
      {
        sgv: 84,
        date: 1785266699378,
        dateString: '2026-07-28T19:24:59.378Z',
        delta: 0,
        direction: 'Flat',
        noise: 84,
        _id: '6a69020dcce981a89c2b209f',
      },
    ]);
  });

  it('skips entries with no sgv (e.g. calibration records)', () => {
    const raw = [{ _id: 'x', date: 1, created_at: 'a', type: 'cal' }];
    expect(parseNightscoutEntries(raw)).toEqual([]);
  });

  it('falls back to identifier when _id is missing, and returns [] for non-arrays', () => {
    const raw = [{ identifier: 'uuid-1', date: 5, sgv: 100, created_at: 'a' }];
    expect(parseNightscoutEntries(raw)[0]._id).toBe('uuid-1');
    expect(parseNightscoutEntries(null)).toEqual([]);
    expect(parseNightscoutEntries(undefined)).toEqual([]);
  });
});

describe('parseNightscoutTreatments', () => {
  it('maps Meal Bolus and Correction Bolus entries', () => {
    const raw = [
      { eventType: 'Meal Bolus', insulin: 2, carbs: null, created_at: '2026-07-28T15:00:20.965Z' },
      { eventType: 'Correction Bolus', insulin: 0.35, carbs: null, created_at: '2026-07-28T18:14:52.402Z' },
      { eventType: 'Meal Bolus', insulin: null, carbs: 20, created_at: '2026-07-28T15:15:02.000Z' },
    ];
    expect(parseNightscoutTreatments(raw)).toEqual([
      { eventType: 'Meal Bolus', insulin: 2, carbs: null, createdAt: '2026-07-28T15:00:20.965Z' },
      { eventType: 'Correction Bolus', insulin: 0.35, carbs: null, createdAt: '2026-07-28T18:14:52.402Z' },
      { eventType: 'Meal Bolus', insulin: null, carbs: 20, createdAt: '2026-07-28T15:15:02.000Z' },
    ]);
  });

  it('skips Temp Basal (pump-only, no schema equivalent) and Note entries', () => {
    const raw = [
      { eventType: 'Temp Basal', rate: 0.8, created_at: '2026-07-28T19:06:41.044Z' },
      { eventType: 'Note', notes: 'AAPS started', created_at: '2026-07-28T13:36:05.913Z' },
    ];
    expect(parseNightscoutTreatments(raw)).toEqual([]);
  });

  it('skips a bolus-type entry with neither insulin nor carbs', () => {
    const raw = [{ eventType: 'Meal Bolus', insulin: null, carbs: null, created_at: '2026-07-28T15:00:00.000Z' }];
    expect(parseNightscoutTreatments(raw)).toEqual([]);
  });

  it('returns [] for non-arrays', () => {
    expect(parseNightscoutTreatments(null)).toEqual([]);
  });
});
