// Tests for the MDI fork added in determine-basal.js (Step 6 of the oref0
// integration — see lib/oref-vendor/MODIFICATIONS.md). Not part of the
// ported oref0 suite: these exercise the new profile.mdiMode branch, which
// only activates when a caller explicitly opts in. determine-basal.test.js
// covers the same fixtures with mdiMode unset/false and must keep passing
// unchanged, proving the fork doesn't alter pump-path behavior.
const determine_basal = require('../lib/determine-basal/determine-basal');
const tempBasalFunctions = require('../lib/basal-set-temp');

describe('determine-basal MDI fork', () => {
  const currenttemp = { duration: 0, rate: 0, temp: 'absolute' };
  const iob_data = { iob: 0, activity: 0, bolussnooze: 0 };
  const autosens = { ratio: 1.0 };
  const meal_data = {
    carbs: 50,
    nsCarbs: 50,
    bwCarbs: 0,
    journalCarbs: 0,
    mealCOB: 0,
    currentDeviation: 0,
    maxDeviation: 0,
    minDeviation: 0,
    slopeFromMaxDeviation: 0,
    slopeFromMinDeviation: 0,
    allDeviations: [0, 0, 0, 0, 0],
    bwFound: false,
  };
  const profile = {
    max_iob: 2.5,
    dia: 3,
    type: 'current',
    current_basal: 0.9,
    max_daily_basal: 1.3,
    max_basal: 3.5,
    max_bg: 120,
    min_bg: 110,
    sens: 40,
    carb_ratio: 10,
    mdiMode: true,
  };

  it('suggests carbs instead of a zero temp when eventual BG is low', () => {
    const glucose_status = { delta: -5, glucose: 75, long_avgdelta: -5, short_avgdelta: -5 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);

    // fixed basal can't be temped down, so no rate/duration should be set
    expect(output.rate).toBeUndefined();
    expect(output.duration).toBeUndefined();

    // excess basal effect (3.5U) converted via carb_ratio (10 g/U) -> 35g
    expect(output.mdiExcessInsulin).toBe(3.5);
    expect(output.carbsSuggested).toBe(35);
    expect(output.reason).toMatch(/MDI: fixed basal can't be reduced\. Suggesting 35g carbs/);
  });

  it('does not suggest carbs when eventual BG is in range', () => {
    const glucose_status = { delta: 0, glucose: 115, long_avgdelta: 1.1, short_avgdelta: 0 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);

    expect(output.carbsSuggested).toBeUndefined();
    expect(output.mdiExcessInsulin).toBeUndefined();
  });

  it('falls back to normal pump behavior when mdiMode is off, given the same low-BG inputs', () => {
    const pumpProfile = { ...profile, mdiMode: false };
    const glucose_status = { delta: -5, glucose: 75, long_avgdelta: -5, short_avgdelta: -5 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, pumpProfile, autosens, meal_data, tempBasalFunctions);

    expect(output.carbsSuggested).toBeUndefined();
    expect(output.mdiExcessInsulin).toBeUndefined();
    expect(output.rate).toBe(0);
    expect(output.duration).toBeGreaterThan(29);
  });

  // Second fork site: "predictive low glucose suspend" — fires earlier in
  // the function than the branch above, whenever bg or minGuardBG drops
  // below `threshold` (~78 here). Upstream would zero a pump's temp basal
  // for a computed duration; MDI has no such action. Unlike the first
  // fork's test above, this branch's excess-insulin figure is derived from
  // minGuardBG — a real per-5-minute predicted-BG guard array, not the
  // simple current iob/activity snapshot — so a flat iob_data object
  // (fine for the other two forks) leaves minGuardBG at its unpopulated
  // sentinel default and produces nonsense. A minimal but real 4h
  // iobArray (shaped like lib/oref-vendor/lib/iob's own output) is needed
  // to exercise this branch meaningfully.
  it('suggests carbs at the predictive-low-glucose-suspend branch', () => {
    const iobArray = [];
    for (let i = 0; i < 48; i++) {
      iobArray.push({ iob: 0, activity: 0, iobWithZeroTemp: { iob: 0, activity: 0 } });
    }
    iobArray[0].lastBolusTime = 0;
    iobArray[0].lastTemp = { date: 0, duration: 0 };

    const glucose_status = { delta: -3, glucose: 65, long_avgdelta: -3, short_avgdelta: -3 };
    const output = determine_basal(glucose_status, currenttemp, iobArray, profile, autosens, meal_data, tempBasalFunctions);

    expect(output.rate).toBeUndefined();
    expect(output.duration).toBeUndefined();
    expect(output.mdiExcessInsulin).toBeCloseTo(1.65, 5);
    expect(output.carbsSuggested).toBeCloseTo(16.5, 5);
    expect(output.reason).toMatch(/MDI: fixed basal can't be reduced\. Suggesting 16\.5g carbs.*\(predictive low\)/);
  });

  // Third fork site: the "naive_eventualBG < 40" severe-predicted-low case,
  // nested inside the same "eventual BG below target" section as the
  // original (first) fork, but gated on a different, rarer condition (BG
  // rising faster than expected yet the crude no-averaging projection is
  // still catastrophic). Deliberately uses a large positive IOB (a big
  // correction bolus mostly still on board) rather than the flat fixture
  // style above, since that's what's needed to satisfy this branch's own
  // (oref0, unmodified) gating — see MODIFICATIONS.md.
  it('suggests carbs at the severe-predicted-low (naive_eventualBG < 40) branch', () => {
    const severeProfile = { ...profile, max_iob: 6 };
    const severeIobData = { iob: 3.6, activity: 0.01, bolussnooze: 0 };
    const glucose_status = { delta: 5, glucose: 75, long_avgdelta: 5, short_avgdelta: 5 };
    const output = determine_basal(
      glucose_status,
      currenttemp,
      severeIobData,
      severeProfile,
      autosens,
      meal_data,
      tempBasalFunctions,
    );

    expect(output.rate).toBeUndefined();
    expect(output.duration).toBeUndefined();
    expect(output.mdiExcessInsulin).toBeCloseTo(4.6, 5);
    expect(output.carbsSuggested).toBeCloseTo(46, 5);
    expect(output.reason).toMatch(/naive_eventualBG < 40.*MDI: fixed basal can't be reduced\. Suggesting 46g carbs.*\(severe predicted low\)/);
  });
});
