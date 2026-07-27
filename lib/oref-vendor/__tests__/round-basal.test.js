// Ported from oref0 tests/determine-basal.test.js (round_basal describe
// block), oref0 v0.7.1 (commit 88cf032). Same fixtures and assertions as
// upstream, translated from mocha+should to jest's expect() — no logic
// changes, this proves the unmodified vendored round-basal.js behaves
// exactly as upstream.
const round_basal = require('../lib/round-basal');

describe('round_basal', () => {
  it('should round correctly without profile being passed in', () => {
    const basal = 0.025;
    expect(round_basal(basal)).toBe(0.05);
  });

  it('should round correctly with an old pump model', () => {
    const profile = { model: '522' };
    expect(round_basal(0.025, profile)).toBe(0.05);
  });

  it('should round correctly with a new pump model', () => {
    const profile = { model: '554' };
    expect(round_basal(0.025, profile)).toBe(0.025);
  });

  it('should round correctly with an invalid pump model', () => {
    const profile = { model: 'HelloThisIsntAPumpModel' };
    expect(round_basal(0.025, profile)).toBe(0.05);
  });

  const data = [
    { basal: 0.83, rounded: 0.85 },
    { basal: 0.86, rounded: 0.85 },
    { basal: 1.83, rounded: 1.85 },
    { basal: 1.86, rounded: 1.85 },
    { basal: 10.83, rounded: 10.8 },
    { basal: 10.86, rounded: 10.9 },
  ];

  data.forEach((rate) => {
    it(`should round basal rates properly (${rate.basal} -> ${rate.rounded})`, () => {
      expect(round_basal(rate.basal)).toBe(rate.rounded);
    });
  });
});
