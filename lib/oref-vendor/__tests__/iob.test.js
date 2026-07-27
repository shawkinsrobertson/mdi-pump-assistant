// Ported from oref0 tests/iob.test.js, oref0 v0.7.1
// (commit 88cf032aa74ff25f69464a7d9cd601ee3940c0b3). This is a
// representative subset — not the full 26-case upstream suite. Deliberately
// prioritizes bolus-only scenarios (this app only ever feeds Bolus-type
// history, never TempBasal/pump-suspend events) plus a couple of pump
// temp-basal edge cases kept for general correctness/safety coverage.
// Same fixtures and assertions as upstream, translated from mocha+should
// to jest's expect() — no logic changes.
const iob = require('../lib/iob');

describe('IOB', () => {
  it('should calculate IOB', () => {
    const basalprofile = [{ i: 0, start: '00:00:00', rate: 1, minutes: 0 }];
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    const inputs = {
      clock: timestamp,
      history: [{ _type: 'Bolus', amount: 2, timestamp }],
      profile: { dia: 3, basalprofile, current_basal: 1, max_daily_basal: 1 },
    };

    const rightAfterBolus = iob(inputs)[0];
    expect(rightAfterBolus.iob).toBe(2);

    const hourLaterInputs = inputs;
    hourLaterInputs.clock = new Date(now + 60 * 60 * 1000).toISOString();
    const hourLater = iob(hourLaterInputs)[0];
    expect(hourLater.iob).toBeLessThan(1.45);
    expect(hourLater.iob).toBeGreaterThan(0);
    expect(hourLater.activity).toBeGreaterThan(0.01);
    expect(hourLater.activity).toBeLessThan(0.02);

    const afterDIAInputs = inputs;
    afterDIAInputs.clock = new Date(now + 3 * 60 * 60 * 1000).toISOString();
    const afterDIA = iob(afterDIAInputs)[0];
    expect(afterDIA.iob).toBe(0);
  });

  it('should calculate IOB with Ultra-fast curve', () => {
    const basalprofile = [{ i: 0, start: '00:00:00', rate: 1, minutes: 0 }];
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    const inputs = {
      clock: timestamp,
      history: [{ _type: 'Bolus', amount: 2, timestamp }],
      profile: { dia: 5, basalprofile, current_basal: 1, max_daily_basal: 1, curve: 'ultra-rapid' },
    };

    const rightAfterBolus = iob(inputs)[0];
    expect(rightAfterBolus.iob).toBe(2);

    const hourLaterInputs = inputs;
    hourLaterInputs.clock = new Date(now + 60 * 60 * 1000).toISOString();
    const hourLater = iob(hourLaterInputs)[0];
    expect(hourLater.iob).toBeLessThan(1.6);
    expect(hourLater.iob).toBeGreaterThan(1.3);
    expect(hourLater.activity).toBeGreaterThan(0.006);
    expect(hourLater.activity).toBeLessThan(0.015);

    const afterDIAInputs = inputs;
    afterDIAInputs.clock = new Date(now + 5 * 60 * 60 * 1000).toISOString();
    const afterDIA = iob(afterDIAInputs)[0];
    expect(afterDIA.iob).toBe(0);
  });

  it('should calculate IOB with Rapid-acting', () => {
    const basalprofile = [{ i: 0, start: '00:00:00', rate: 1, minutes: 0 }];
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    const inputs = {
      clock: timestamp,
      history: [{ _type: 'Bolus', amount: 1, timestamp }],
      profile: { dia: 5, basalprofile, current_basal: 1, max_daily_basal: 1, curve: 'rapid-acting' },
    };

    const rightAfterBolus = iob(inputs)[0];
    expect(rightAfterBolus.iob).toBe(1);

    const hourLaterInputs = inputs;
    hourLaterInputs.clock = new Date(now + 60 * 60 * 1000).toISOString();
    const hourLater = iob(hourLaterInputs)[0];
    expect(hourLater.iob).toBeLessThan(0.8);
    expect(hourLater.iob).toBeGreaterThan(0);

    const afterDIAInputs = inputs;
    afterDIAInputs.clock = new Date(now + 5 * 60 * 60 * 1000).toISOString();
    const afterDIA = iob(afterDIAInputs)[0];
    expect(afterDIA.iob).toBe(0);
  });

  it('should force minimum 5 hour DIA with Rapid-acting', () => {
    const basalprofile = [{ i: 0, start: '00:00:00', rate: 1, minutes: 0 }];
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    const inputs = {
      clock: timestamp,
      history: [{ _type: 'Bolus', amount: 1, timestamp }],
      profile: { dia: 5, basalprofile, current_basal: 1, max_daily_basal: 1, curve: 'rapid-acting' },
    };

    const hourLaterInputs = inputs;
    hourLaterInputs.clock = new Date(now + 4 * 60 * 60 * 1000).toISOString();
    const hourLaterWith5 = iob(hourLaterInputs)[0];

    hourLaterInputs.profile.dia = 3;
    const hourLaterWith4 = iob(hourLaterInputs)[0];

    expect(hourLaterWith4.iob).toBe(hourLaterWith5.iob);
  });

  it('should calculate IOB using a 4 hour duration', () => {
    const basalprofile = [{ i: 0, start: '00:00:00', rate: 1, minutes: 0 }];
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    const inputs = {
      clock: timestamp,
      history: [{ _type: 'Bolus', amount: 1, timestamp }],
      profile: { dia: 4, basalprofile, current_basal: 1, max_daily_basal: 1 },
    };

    const rightAfterBolus = iob(inputs)[0];
    expect(rightAfterBolus.iob).toBe(1);

    const hourLaterInputs = inputs;
    hourLaterInputs.clock = new Date(now + 60 * 60 * 1000).toISOString();
    const hourLater = iob(hourLaterInputs)[0];
    expect(hourLater.iob).toBeLessThan(1);
    expect(hourLater.iob).toBeGreaterThan(0);

    const after3hInputs = inputs;
    after3hInputs.clock = new Date(now + 3 * 60 * 60 * 1000).toISOString();
    const after3h = iob(after3hInputs)[0];
    expect(after3h.iob).toBeGreaterThan(0);

    const after4hInputs = inputs;
    after4hInputs.clock = new Date(now + 4 * 60 * 60 * 1000).toISOString();
    const after4h = iob(after4hInputs)[0];
    expect(after4h.iob).toBe(0);
  });

  // Kept from the pump-oriented test set as a general safety check: IOB
  // must never go negative, even with drastic basal-profile/temp-basal
  // changes (not a scenario this app produces itself, but a correctness
  // guarantee of the shared vendored calculation).
  it('should not report negative IOB with Temp Basals and a basal profile with drastic changes', () => {
    const basalprofile = [
      { i: 0, start: '00:00:00', rate: 0.1, minutes: 0 },
      { i: 1, start: '00:30:00', rate: 2, minutes: 30 },
    ];

    const startingPoint = new Date('2016-06-13 00:00:00.000');
    const startingPoint2 = new Date('2016-06-13 00:30:00.000');
    const endPoint = new Date('2016-06-13 01:00:00.000');

    const inputs = {
      clock: endPoint,
      history: [
        { _type: 'TempBasalDuration', 'duration (min)': 30, date: startingPoint, timestamp: startingPoint },
        { _type: 'TempBasal', rate: 0.1, date: startingPoint, timestamp: startingPoint },
        { _type: 'TempBasal', rate: 2, date: startingPoint2, timestamp: startingPoint2 },
        { _type: 'TempBasalDuration', 'duration (min)': 30, date: startingPoint2, timestamp: startingPoint2 },
      ],
      profile: { dia: 3, current_basal: 2, max_daily_basal: 2, basalprofile },
    };

    const hourLater = iob(inputs)[0];
    expect(hourLater.iob).toBe(0);
  });
});
