// Ported from oref0 tests/determine-basal.test.js, oref0 v0.7.1
// (commit 88cf032aa74ff25f69464a7d9cd601ee3940c0b3). This is a
// representative subset — not the full 70-case upstream suite — chosen to
// cover the main branches (in-range, high, low, edge cases) with extra
// weight on the "eventual BG below target" branch (the low-glucose-suspend
// / low-temp cases below), since that's the exact branch the MDI fork
// touches. Same fixtures and assertions as upstream, translated from
// mocha+should to jest's expect() — no logic changes. These must all keep
// passing unchanged after the MDI fork is added (see mdi-fork.test.js),
// proving the fork doesn't alter pump-path behavior.
const determine_basal = require('../lib/determine-basal/determine-basal');
const tempBasalFunctions = require('../lib/basal-set-temp');

describe('determine-basal', () => {
  // standard initial conditions for all determine-basal test cases unless overridden
  const glucose_status = { delta: 0, glucose: 115, long_avgdelta: 1.1, short_avgdelta: 0 };
  const currenttemp = { duration: 0, rate: 0, temp: 'absolute' };
  const iob_data = { iob: 0, activity: 0, bolussnooze: 0 };
  const autosens = { ratio: 1.0 };
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
  };
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

  it('should cancel high temp when in range w/o IOB', () => {
    const currenttemp = { duration: 30, rate: 1.5, temp: 'absolute' };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBe(0.9);
    expect(output.duration).toBe(30);
  });

  // low glucose suspend test cases — directly adjacent to the MDI fork point
  it('should temp to 0 when low w/o IOB', () => {
    const glucose_status = { delta: -5, glucose: 75, long_avgdelta: -5, short_avgdelta: -5 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBe(0);
    expect(output.duration).toBeGreaterThan(29);
  });

  it('should not extend temp to 0 when <10m elapsed', () => {
    const currenttemp = { duration: 57, rate: 0, temp: 'absolute' };
    const glucose_status = { delta: -5, glucose: 75, long_avgdelta: -5, short_avgdelta: -5 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBeUndefined();
    expect(output.duration).toBeUndefined();
  });

  it('should do nothing when low and rising w/o IOB', () => {
    const glucose_status = { delta: 6, glucose: 75, long_avgdelta: 6, short_avgdelta: 6 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBe(0.9);
    expect(output.duration).toBe(30);
  });

  it('should temp to zero when rising slower than BGI', () => {
    const glucose_status = { delta: 1, glucose: 75, long_avgdelta: 1, short_avgdelta: 1 };
    const iob_data = { iob: -0.5, activity: -0.01, bolussnooze: 0 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBe(0);
    expect(output.duration).toBe(30);
  });

  it('should temp to 0 when low and falling, regardless of BGI', () => {
    const glucose_status = { delta: -1, glucose: 75, long_avgdelta: -1, short_avgdelta: -1 };
    const iob_data = { iob: 1, activity: 0.01, bolussnooze: 0.5 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBe(0);
    expect(output.duration).toBeGreaterThan(29);
  });

  it('should high-temp when > 80-ish and rising w/ lots of negative IOB', () => {
    const glucose_status = { delta: 5, glucose: 85, long_avgdelta: 5, short_avgdelta: 5 };
    const iob_data = { iob: -1, activity: -0.01, bolussnooze: 0 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBeGreaterThan(1);
    expect(output.duration).toBe(30);
    expect(output.reason).toMatch(/no temp, setting/);
  });

  it('should high-temp when > 180-ish and rising but not more then maxSafeBasal', () => {
    const glucose_status = { delta: 5, glucose: 185, long_avgdelta: 5, short_avgdelta: 5 };
    const iob_data = { iob: 0, activity: -0.01, bolussnooze: 0 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.reason).toMatch(/.*, adj. req. rate:.* to maxSafeBasal:.*, no temp, setting/);
  });

  it('should reduce high-temp when schedule would be above max', () => {
    const glucose_status = { delta: 5, glucose: 145, long_avgdelta: 5, short_avgdelta: 5 };
    const currenttemp = { duration: 160, rate: 1.9, temp: 'absolute' };
    const iob_data = { iob: 0, activity: -0.01, bolussnooze: 0 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.duration).toBe(30);
    expect(output.reason).toMatch(/.* > 2.*insulinReq. Setting temp.*/);
  });

  it('should continue high-temp when required ~= temp running', () => {
    const glucose_status = { delta: 5, glucose: 145, long_avgdelta: 5, short_avgdelta: 5 };
    const currenttemp = { duration: 30, rate: 3.5, temp: 'absolute' };
    const iob_data = { iob: 0, activity: -0.01, bolussnooze: 0 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBeUndefined();
    expect(output.duration).toBeUndefined();
    expect(output.reason).toMatch(/Eventual BG .*>.*, temp .* >~ req /);
  });

  it('should stop high-temp when iob is near max_iob.', () => {
    const glucose_status = { delta: 5, glucose: 485, long_avgdelta: 5, short_avgdelta: 5 };
    const iob_data = { iob: 3.5, activity: 0.05, bolussnooze: 0 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBe(0.9);
    expect(output.duration).toBe(30);
    expect(output.reason).toMatch(/IOB .* > max_iob .*/);
  });

  it('should temp to 0 when LOW w/ positive IOB', () => {
    const glucose_status = { delta: 0, glucose: 39, long_avgdelta: -1.1, short_avgdelta: 0 };
    const iob_data = { iob: 1, activity: 0.01, bolussnooze: 0.5 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBe(0);
    expect(output.duration).toBeGreaterThan(29);
  });

  it('should low temp when LOW w/ negative IOB', () => {
    const glucose_status = { delta: 0, glucose: 39, long_avgdelta: -1.1, short_avgdelta: 0 };
    const iob_data = { iob: -2.5, activity: -0.03, bolussnooze: 0 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBeLessThan(0.8);
    expect(output.duration).toBeGreaterThan(29);
  });

  it('should temp to 0 when LOW w/ no IOB', () => {
    const glucose_status = { delta: 0, glucose: 39, long_avgdelta: -1.1, short_avgdelta: 0 };
    const iob_data = { iob: 0, activity: 0, bolussnooze: 0 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBe(0);
    expect(output.duration).toBeGreaterThan(29);
  });

  // low eventualBG — this is the exact branch the MDI fork modifies
  it('should low-temp when eventualBG < min_bg', () => {
    const glucose_status = { delta: -3, glucose: 110, long_avgdelta: -1, short_avgdelta: -1 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBeLessThan(0.8);
    expect(output.duration).toBeGreaterThan(29);
    expect(output.reason).toMatch(/Eventual BG .*< 110.*/);
  });

  it('should low-temp when eventualBG < min_bg with delta > exp. delta', () => {
    const glucose_status = { delta: -5, glucose: 115, long_avgdelta: -6, short_avgdelta: -6 };
    const iob_data = { iob: 2, activity: 0.05, bolussnooze: 0 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBeLessThan(0.2);
    expect(output.duration).toBeGreaterThan(29);
  });

  it('should low-temp when eventualBG < min_bg with delta > exp. delta (2)', () => {
    const glucose_status = { delta: -2, glucose: 156, long_avgdelta: -1.33, short_avgdelta: -1.33 };
    const iob_data = { iob: 3.51, activity: 0.06, bolussnooze: 0.08 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBeLessThan(0.8);
    expect(output.duration).toBe(30);
    expect(output.reason).toMatch(/Eventual BG .*< 110.*setting .*/);
  });

  it('should low-temp much less when eventualBG < min_bg with delta barely negative', () => {
    const glucose_status = { delta: -1, glucose: 115, long_avgdelta: -1, short_avgdelta: -1 };
    const iob_data = { iob: 2, activity: 0.05, bolussnooze: 0 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBeGreaterThan(0.3);
    expect(output.rate).toBeLessThan(0.8);
    expect(output.duration).toBe(30);
    expect(output.reason).toMatch(/Eventual BG .*< 110.*setting .*/);
  });

  it('should cancel low-temp when lowish and delta rising faster than BGI', () => {
    const currenttemp = { duration: 20, rate: 0.5, temp: 'absolute' };
    const glucose_status = { delta: 3, glucose: 85, long_avgdelta: 3, short_avgdelta: 3 };
    const iob_data = { iob: -0.7, activity: -0.01, bolussnooze: 0 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBeGreaterThan(0.8);
    expect(output.duration).toBe(30);
  });

  it('should high-temp when eventualBG > max_bg', () => {
    const glucose_status = { delta: 3, glucose: 120, long_avgdelta: 0, short_avgdelta: 1 };
    const output = determine_basal(glucose_status, currenttemp, iob_data, profile, autosens, meal_data, tempBasalFunctions);
    expect(output.rate).toBeGreaterThan(1);
    expect(output.duration).toBe(30);
    expect(output.reason).toMatch(/Eventual BG .*>= 120/);
  });

  it('should profile.current_basal be undefined return error', () => {
    const result = determine_basal(undefined, undefined, undefined, undefined);
    expect(result.error).toBe('Error: could not get current basal rate');
  });
});
