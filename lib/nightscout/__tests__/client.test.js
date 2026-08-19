const { normalizeEntry, normalizeTreatment } = require('../client');

describe('normalizeEntry', () => {
  it('passes through a well-formed Nightscout sgv entry', () => {
    const raw = {
      _id: 'abc123',
      sgv: 145,
      date: 1700000000000,
      dateString: '2023-11-14T22:13:20.000Z',
      delta: 3,
      direction: 'Flat',
      noise: 1,
    };
    expect(normalizeEntry(raw)).toEqual({
      sgv: 145,
      date: 1700000000000,
      dateString: '2023-11-14T22:13:20.000Z',
      delta: 3,
      direction: 'Flat',
      noise: 1,
      _id: 'abc123',
    });
  });

  it('defaults missing optional fields instead of producing undefined/NaN', () => {
    // Real Nightscout deployments don't reliably include delta/direction/
    // noise on every entry (varies by uploader/plugin) — this is the
    // actual gap the defaulting exists for, not a hypothetical.
    const raw = { _id: 'abc123', sgv: 145, date: 1700000000000 };
    const result = normalizeEntry(raw);
    expect(result.delta).toBe(0);
    expect(result.direction).toBe('None');
    expect(result.noise).toBe(0);
    expect(result.dateString).toBe(new Date(1700000000000).toISOString());
  });

  it('rejects an entry missing a required field (sgv, date, or _id)', () => {
    expect(normalizeEntry({ sgv: 145, date: 1700000000000 })).toBeNull(); // no _id
    expect(normalizeEntry({ _id: 'abc123', date: 1700000000000 })).toBeNull(); // no sgv
    expect(normalizeEntry({ _id: 'abc123', sgv: 145 })).toBeNull(); // no date
  });

  it('rejects non-object input', () => {
    expect(normalizeEntry(null)).toBeNull();
    expect(normalizeEntry('not an entry')).toBeNull();
    expect(normalizeEntry(42)).toBeNull();
  });
});

describe('normalizeTreatment', () => {
  it('passes through a well-formed Nightscout treatment', () => {
    const raw = {
      _id: 'xyz789',
      eventType: 'Meal Bolus',
      insulin: 4,
      carbs: 30,
      created_at: '2023-11-14T22:13:20.000Z',
      notes: 'pizza',
    };
    expect(normalizeTreatment(raw)).toEqual({
      id: 'xyz789',
      eventType: 'Meal Bolus',
      insulin: 4,
      carbs: 30,
      createdAt: '2023-11-14T22:13:20.000Z',
      notes: 'pizza',
    });
  });

  it('defaults missing optional fields to null', () => {
    const raw = { _id: 'xyz789', created_at: '2023-11-14T22:13:20.000Z' };
    expect(normalizeTreatment(raw)).toEqual({
      id: 'xyz789',
      eventType: null,
      insulin: null,
      carbs: null,
      createdAt: '2023-11-14T22:13:20.000Z',
      notes: null,
    });
  });

  it('rejects a treatment missing a required field (_id or created_at)', () => {
    expect(normalizeTreatment({ created_at: '2023-11-14T22:13:20.000Z' })).toBeNull();
    expect(normalizeTreatment({ _id: 'xyz789' })).toBeNull();
  });

  it('normalizes non-canonical created_at formats to the same ISO string real Nightscout uploaders vary on', () => {
    // Regression test for the on-device bug: different Nightscout
    // uploaders (AndroidAPS/Loop/xDrip+/etc.) don't all serialize
    // created_at identically. Without normalizing here, a stored SQL
    // string comparison downstream (lib/db/nightscoutTreatments.ts)
    // silently mismatched real treatments, and the AI Insights payload
    // reported zero carb/insulin entries despite the Logbook showing
    // genuinely-synced treatments.
    const canonical = '2023-11-14T22:13:20.000Z';
    const noMillis = normalizeTreatment({ _id: 'a', created_at: '2023-11-14T22:13:20Z' });
    const numericOffset = normalizeTreatment({ _id: 'b', created_at: '2023-11-14T17:13:20-05:00' });
    expect(noMillis.createdAt).toBe(canonical);
    expect(numericOffset.createdAt).toBe(canonical);
  });

  it('rejects a treatment whose created_at does not parse to a real date', () => {
    expect(normalizeTreatment({ _id: 'xyz789', created_at: 'not a date' })).toBeNull();
  });
});
