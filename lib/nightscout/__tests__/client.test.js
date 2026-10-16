const { normalizeEntry, normalizeTreatment, fetchNightscoutTreatments } = require('../client');

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

describe('fetchNightscoutTreatments', () => {
  // Regression coverage for the on-device bug: Nightscout's REST API
  // sorts matches newest-first and `count` caps the result-set size, not
  // a page — a single request against a wide window (this app's 7-day
  // first-sync lookback) silently dropped everything older than the
  // newest `count` matches. fetchNightscoutTreatments now pages backward
  // via a `created_at <$lte>` cursor until a short/empty page signals the
  // `$gte..$lte` window is exhausted.

  const BASE_URL = 'https://ns.example.com';
  const TOKEN = 'test-token';

  // A tiny fake Nightscout server: filters `treatments` by the request's
  // find[created_at][$gte]/[$lte] params, sorts newest-first (matching
  // real Nightscout's default, undocumented-sort-param behavior), and
  // truncates to `count` — i.e. it reproduces the exact silent-drop
  // behavior this fix works around, so these tests fail against the
  // unpatched single-request implementation.
  function mockServer(treatments) {
    return jest.fn(async (urlString) => {
      const url = new URL(urlString);
      const count = Number(url.searchParams.get('count'));
      const gte = url.searchParams.get('find[created_at][$gte]');
      const lte = url.searchParams.get('find[created_at][$lte]');
      const gteMs = gte ? Date.parse(gte) : -Infinity;
      const lteMs = lte ? Date.parse(lte) : Infinity;

      const matching = treatments
        .filter((t) => {
          const ms = Date.parse(t.created_at);
          return ms >= gteMs && ms <= lteMs;
        })
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)); // newest-first, same as real Nightscout

      const page = matching.slice(0, count);
      return { ok: true, status: 200, json: async () => page };
    });
  }

  function treatment(id, isoCreatedAt) {
    return { _id: id, eventType: 'Temp Basal', insulin: null, carbs: null, created_at: isoCreatedAt, notes: null };
  }

  afterEach(() => {
    delete global.fetch;
  });

  it('retrieves every treatment matching the window, not just the newest `count` (multi-page)', async () => {
    // 5 matching treatments, oldest to newest, one minute apart — well
    // within the requested $gte window, but more than fit in one page at
    // a page size of 2.
    const all = [
      treatment('t1', '2024-01-01T00:00:00.000Z'),
      treatment('t2', '2024-01-01T00:01:00.000Z'),
      treatment('t3', '2024-01-01T00:02:00.000Z'),
      treatment('t4', '2024-01-01T00:03:00.000Z'),
      treatment('t5', '2024-01-01T00:04:00.000Z'),
    ];
    global.fetch = mockServer(all);

    const result = await fetchNightscoutTreatments(BASE_URL, TOKEN, '2023-01-01T00:00:00.000Z', 2);

    expect(result.map((t) => t.id).sort()).toEqual(['t1', 't2', 't3', 't4', 't5']);
    // More than one page was needed to get there — this is the behavior
    // the unpatched single-request version didn't have.
    expect(global.fetch.mock.calls.length).toBeGreaterThan(1);
  });

  it('terminates correctly when the window ends on an exact page boundary (final page empty)', async () => {
    // 4 matching treatments at a page size of 2: page 1 and page 2 are
    // both full (2 records each), so a naive "stop when the page isn't
    // full" check would miss that the window is exhausted — the loop
    // must issue a third, empty page before stopping.
    const all = [
      treatment('a1', '2024-02-01T00:00:00.000Z'),
      treatment('a2', '2024-02-01T00:01:00.000Z'),
      treatment('a3', '2024-02-01T00:02:00.000Z'),
      treatment('a4', '2024-02-01T00:03:00.000Z'),
    ];
    global.fetch = mockServer(all);

    const result = await fetchNightscoutTreatments(BASE_URL, TOKEN, '2023-01-01T00:00:00.000Z', 2);

    expect(result.map((t) => t.id).sort()).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(global.fetch.mock.calls.length).toBe(3); // 2 full pages + 1 empty page that stops the loop
  });

  it('terminates correctly on a final partial page', async () => {
    // 5 matching treatments at a page size of 2: 2 full pages + a final
    // page of 1 (< count), which should stop the loop without an extra
    // empty-page request.
    const all = [
      treatment('b1', '2024-03-01T00:00:00.000Z'),
      treatment('b2', '2024-03-01T00:01:00.000Z'),
      treatment('b3', '2024-03-01T00:02:00.000Z'),
      treatment('b4', '2024-03-01T00:03:00.000Z'),
      treatment('b5', '2024-03-01T00:04:00.000Z'),
    ];
    global.fetch = mockServer(all);

    const result = await fetchNightscoutTreatments(BASE_URL, TOKEN, '2023-01-01T00:00:00.000Z', 2);

    expect(result.map((t) => t.id).sort()).toEqual(['b1', 'b2', 'b3', 'b4', 'b5']);
    expect(global.fetch.mock.calls.length).toBe(3); // 2 full pages + 1 partial (1 record) page that stops the loop
  });

  it('leaves existing single-page behavior unaffected when everything fits in one page', async () => {
    const all = [
      treatment('c1', '2024-04-01T00:00:00.000Z'),
      treatment('c2', '2024-04-01T00:01:00.000Z'),
      treatment('c3', '2024-04-01T00:02:00.000Z'),
    ];
    global.fetch = mockServer(all);

    // Default count (200) comfortably covers all 3 — should resolve in a
    // single request, same as the pre-pagination implementation.
    const result = await fetchNightscoutTreatments(BASE_URL, TOKEN, '2023-01-01T00:00:00.000Z');

    expect(global.fetch.mock.calls.length).toBe(1);
    expect(result.map((t) => t.id).sort()).toEqual(['c1', 'c2', 'c3']);
    expect(result.find((t) => t.id === 'c1')).toEqual({
      id: 'c1',
      eventType: 'Temp Basal',
      insulin: null,
      carbs: null,
      createdAt: '2024-04-01T00:00:00.000Z',
      notes: null,
    });
  });

  it('stops at the hard page cap instead of looping forever against a pathological server', async () => {
    // A server that always returns a full page, no matter how far back
    // the $lte cursor is pushed (e.g. a buggy/malicious response) must
    // not cause an infinite loop.
    let callCount = 0;
    global.fetch = jest.fn(async (urlString) => {
      callCount++;
      const url = new URL(urlString);
      const count = Number(url.searchParams.get('count'));
      const lte = url.searchParams.get('find[created_at][$lte]');
      const anchorMs = lte ? Date.parse(lte) : Date.parse('2024-06-01T00:00:00.000Z');
      const page = Array.from({ length: count }, (_, i) => {
        const ms = anchorMs - i * 1000; // 1-second steps, strictly decreasing
        return treatment(`p${callCount}-${i}`, new Date(ms).toISOString());
      });
      return { ok: true, status: 200, json: async () => page };
    });

    const result = await fetchNightscoutTreatments(BASE_URL, TOKEN, '1900-01-01T00:00:00.000Z', 2);

    expect(global.fetch.mock.calls.length).toBe(50); // MAX_PAGES hard cap
    expect(result.length).toBe(100); // 50 pages * 2 records/page, deduped
  });
});
