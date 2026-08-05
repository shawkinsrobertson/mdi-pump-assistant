// The pure core of the oref0 orchestration: given already-loaded data, build
// oref0's inputs and call the vendored determine_basal(). No DB/AsyncStorage
// access here (not even via a type-only re-export) — every import below is
// either the vendored algorithm or `import type`, both erased/inert at
// runtime — so this file can be required under jest without pulling in
// expo-sqlite (see runPrediction.ts, which is the thin I/O shell that
// fetches real data and calls into this file).
import detectSensitivity from '../oref-vendor/lib/determine-basal/autosens';
import determineBasal from '../oref-vendor/lib/determine-basal/determine-basal';
import generateMealData from '../oref-vendor/lib/meal';
import getLastGlucose from '../oref-vendor/lib/glucose-get-last';
import iobGenerate from '../oref-vendor/lib/iob';
import tempBasalFunctions from '../oref-vendor/lib/basal-set-temp';

import type { BasalDoseRecord } from '../db/basalDoses';
import type { Treatment } from '../db/treatments';
import type { GlucoseReading } from '../glucose';
import { currentBasalRate } from '../mdi/basalCurve';
import type { Settings } from '../settings';

// oref0's own algorithm-internal tuning constants (not personal clinical
// values — these are the published defaults oref0 itself ships with, kept
// as part of vendoring the algorithm rather than invented by this app).
const CARBS_REQ_THRESHOLD = 1; // g
const MIN_5M_CARBIMPACT = 8; // mg/dL per 5m
const MAX_COB = 120; // g

// oref0-meal.js's own CLI bails on carb-absorption detection below this
// many glucose points ("Not enough glucose data to calculate carb
// absorption"). Kept as an informational threshold (see
// insufficientGlucoseForCOB below) rather than a hard override — cob.js
// only actually needs ~45m of recent, contiguous data for its own
// deviation window, so gating the whole mealCOB result on 3h of total
// history discarded otherwise-valid calculations.
const MIN_GLUCOSE_POINTS_FOR_COB = 36;

// oref0's own defaults for how far autosens is allowed to move ISF (see
// autosens.js's ratio clamp) — algorithm tuning constants, not personal
// clinical values.
const AUTOSENS_MIN = 0.7;
const AUTOSENS_MAX = 1.2;

// oref0-detect-sensitivity.js's own CLI requires 6h of glucose data before
// attempting autosens at all ("Optional feature autosens disabled: not
// enough glucose data"); replicated here rather than inventing a
// different threshold.
const MIN_GLUCOSE_POINTS_FOR_AUTOSENS = 72;

// oref0-detect-sensitivity.js's own CLI runs autosens twice — once over
// the most recent 8h of non-excluded deviations, once over up to 24h —
// and uses whichever ratio is lower (more sensitive-favoring), rather
// than trusting either window alone. Replicated verbatim below.
const AUTOSENS_SHORT_WINDOW_DEVIATIONS = 96;
const AUTOSENS_LONG_WINDOW_DEVIATIONS = 288;

export type PredictionResult =
  | { status: 'settings-incomplete'; missing: string[] }
  | { status: 'no-glucose-data' }
  | {
      status: 'ok';
      eventualBG: number | null;
      reason: string;
      carbsSuggested: number | null;
      mdiExcessInsulin: number | null;
      iob: number;
      mealCOB: number;
      // True when carbs are logged and not yet fully accounted for, but
      // the most recent glucose trend can't confirm any absorption right
      // now (e.g. a CGM sync gap) — mealCOB reads 0 without this being a
      // confirmed "no carbs on board." See cobPending's definition above.
      cobPending: boolean;
      currentBasal: number;
      insufficientGlucoseForCOB: boolean;
      autosensRatio: number;
      autosensAdjustedISF: number | null;
      autosensInsufficientData: boolean;
      // 5-minute-interval predicted BG curve from determine-basal.js's own
      // internal projection (rT.predBGs) — COB preferred when meal carbs are
      // on board (more informative than IOB-only), else IOB, else null if
      // neither was computed. Used to draw the dashed "leading" line on the
      // Dashboard chart; not a clinical claim, just oref0's own forward
      // extrapolation of current IOB/COB decay.
      predBGs: number[] | null;
    };

interface RequiredSettings {
  isf: number;
  carbRatio: number;
  targetBG: number;
  dia: number;
  maxIOB: number;
}

export function checkRequiredSettings(settings: Settings): RequiredSettings | string[] {
  const missing: string[] = [];
  if (settings.isf == null) missing.push('ISF');
  if (settings.carbRatio == null) missing.push('carb ratio');
  if (settings.targetBG == null) missing.push('target BG');
  if (settings.dia == null) missing.push('DIA');
  if (settings.maxIOB == null) missing.push('max IOB');
  if (missing.length > 0) return missing;
  return {
    isf: settings.isf!,
    carbRatio: settings.carbRatio!,
    targetBG: settings.targetBG!,
    dia: settings.dia!,
    maxIOB: settings.maxIOB!,
  };
}

// oref0's own shape: {_type, amount, timestamp} for boluses (see
// lib/oref-vendor/lib/iob/history.js and meal/history.js).
export function toPumpHistory(treatments: Treatment[]): Array<{ _type: string; amount: number; timestamp: string }> {
  return treatments
    .filter((t) => t.insulin != null && t.insulin > 0)
    .map((t) => ({ _type: 'Bolus', amount: t.insulin!, timestamp: t.createdAt }));
}

// oref0's own shape: {carbs, created_at} (see lib/oref-vendor/lib/meal/history.js).
export function toCarbHistory(treatments: Treatment[]): Array<{ carbs: number; created_at: string }> {
  return treatments
    .filter((t) => t.carbs != null && t.carbs > 0)
    .map((t) => ({ carbs: t.carbs!, created_at: t.createdAt }));
}

// oref0's glucose_data shape needs BOTH `date` (epoch ms — used by the
// later BGI/deviation loop in cob.js and by glucose-get-last.js) and
// `dateString` (used by cob.js's own bucketing loop). Newest-first, which
// both glucose-get-last.js and cob.js assume. Returns fresh objects each
// call since glucose-get-last.js and cob.js both mutate the objects they
// receive (e.g. averaging two close-together points) — sharing one array
// between the two calls would let one contaminate the other.
export function toGlucoseData(readings: GlucoseReading[]): Array<{ date: number; dateString: string; glucose: number }> {
  return [...readings]
    .sort((a, b) => b.date - a.date)
    .map((r) => ({ date: r.date, dateString: new Date(r.date).toISOString(), glucose: r.sgv }));
}

interface AutosensProfile {
  sens: number;
  carb_ratio: number;
  min_5m_carbimpact: number;
  isfProfile: { sensitivities: Array<{ offset: number; sensitivity: number }> };
  autosens_min: number;
  autosens_max: number;
  max_daily_basal: number;
}

interface AutosensResult {
  ratio: number;
  insufficientData: boolean;
}

// Detects insulin sensitivity/resistance from unexplained BG deviations
// (oref0's own autosens.js — vendored, not reimplemented) and returns the
// ratio determine_basal should use to recalibrate ISF. Not wired into the
// bolus wizard (lib/bolus.ts) — only into this prediction/suggestion path,
// per an explicit decision not to touch manual dosing yet.
//
// profile.max_daily_basal (used only as a normalizing denominator inside
// autosens.js — it has no other effect and never represents an actual
// delivery limit) has no literal MDI equivalent, since there's no daily
// basal schedule to take a peak from. currentBasal (the calculated hourly
// rate from the user's logged long-acting dose) is used as the stand-in —
// the closest real "normal hourly insulin rate" MDI has, and numerically
// equivalent to what a flat-basal-profile pump user would produce here
// anyway (current_basal == max_daily_basal for a flat schedule).
function computeAutosens(
  glucoseReadings: GlucoseReading[],
  treatments: Treatment[],
  profile: AutosensProfile,
  basalProfileForCob: Array<{ i: number; start: string; minutes: number; rate: number }>,
): AutosensResult {
  // autosens.js divides its basal-effect deviation by profile.max_daily_basal
  // as a normalizing denominator (see the comment above computeAutosens).
  // With no current basal dose logged (currentBasal === 0, e.g. the user
  // hasn't logged today's long-acting shot yet, or its duration has
  // lapsed), that's a division by zero — producing a NaN ratio that then
  // poisons ISF, deviation, and eventualBG all the way through
  // determine_basal, surfacing only as an opaque "could not calculate
  // eventualBG" error. Bail out the same way the "not enough glucose
  // data" case does: there's no valid basis to normalize against.
  if (glucoseReadings.length < MIN_GLUCOSE_POINTS_FOR_AUTOSENS || profile.max_daily_basal <= 0) {
    return { ratio: 1, insufficientData: true };
  }

  const iobInputs = { history: toPumpHistory(treatments), profile };
  const baseInputs = {
    iob_inputs: iobInputs,
    carbs: toCarbHistory(treatments),
    basalprofile: basalProfileForCob,
    temptargets: [],
    retrospective: false,
  };

  const shortWindow = detectSensitivity({
    ...baseInputs,
    glucose_data: toGlucoseData(glucoseReadings),
    deviations: AUTOSENS_SHORT_WINDOW_DEVIATIONS,
  });
  const longWindow = detectSensitivity({
    ...baseInputs,
    glucose_data: toGlucoseData(glucoseReadings),
    deviations: AUTOSENS_LONG_WINDOW_DEVIATIONS,
  });

  return { ratio: Math.min(shortWindow.ratio, longWindow.ratio), insufficientData: false };
}

export interface ComputePredictionInputs {
  settings: Settings;
  glucoseReadings: GlucoseReading[];
  treatments: Treatment[];
  basalDoses: BasalDoseRecord[];
  now: Date;
}

export function computePrediction({
  settings,
  glucoseReadings,
  treatments,
  basalDoses,
  now,
}: ComputePredictionInputs): PredictionResult {
  const required = checkRequiredSettings(settings);
  if (Array.isArray(required)) {
    return { status: 'settings-incomplete', missing: required };
  }

  if (glucoseReadings.length === 0) {
    // Mirrors AndroidAPS's own "no bucketed data available" bail-out
    // rather than guessing with an empty glucose_status.
    return { status: 'no-glucose-data' };
  }

  const currentBasal = currentBasalRate(basalDoses, now);
  const clock = now.toISOString();

  const profile = {
    max_iob: required.maxIOB,
    dia: required.dia,
    current_basal: currentBasal,
    sens: required.isf,
    carb_ratio: required.carbRatio,
    min_bg: required.targetBG,
    max_bg: required.targetBG,
    carbsReqThreshold: CARBS_REQ_THRESHOLD,
    min_5m_carbimpact: MIN_5M_CARBIMPACT,
    maxCOB: MAX_COB,
    isfProfile: { sensitivities: [{ offset: 0, sensitivity: required.isf }] },
    // See computeAutosens's own comment for why max_daily_basal is
    // currentBasal here.
    max_daily_basal: currentBasal,
    autosens_min: AUTOSENS_MIN,
    autosens_max: AUTOSENS_MAX,
    mdiMode: true,
  };

  const pumpHistory = toPumpHistory(treatments);
  const carbHistory = toCarbHistory(treatments);
  // Inert placeholder for cob.js's (and autosens.js's) internal
  // basalLookup() calls: this app never logs TempBasal history, so
  // profile.current_basal is only ever read there for a code path
  // (duration>0 temp-basal splitting) that never triggers for bolus-only
  // pump history. A non-zero value just satisfies basalLookup's own "bad
  // basal schedule" guard.
  const basalProfileForCob = [{ i: 0, start: '00:00:00', minutes: 0, rate: Math.max(currentBasal, 0.001) }];

  const autosens = computeAutosens(glucoseReadings, treatments, profile, basalProfileForCob);

  const glucoseStatus = getLastGlucose(toGlucoseData(glucoseReadings));

  const iobData = iobGenerate({
    clock,
    history: pumpHistory,
    profile,
    autosens: { ratio: autosens.ratio },
  });

  // Informational only now — NOT used to force mealCOB to 0. cob.js's own
  // bucketing loop (lib/oref-vendor/lib/determine-basal/cob.js) already
  // requires ~45m of recent, contiguous glucose data to produce a
  // currentDeviation/maxDeviation, and total.js's own "zombie-carb" check
  // (lib/oref-vendor/lib/meal/total.js) already zeroes mealCOB whenever
  // that data is missing. This extra 36-point/3h gate used to *also*
  // force mealCOB to 0 even when cob.js had already computed a perfectly
  // valid value from a shorter but sufficient recent window (e.g. right
  // after a fresh BLE reconnect with only ~1h of accumulated history) —
  // silently discarding logged carbs' COB. Trust cob.js's own gate as the
  // sole authority; keep this flag only so the UI can flag lower
  // confidence, not to override the calculation.
  const insufficientGlucoseForCOB = glucoseReadings.length < MIN_GLUCOSE_POINTS_FOR_COB;
  const mealData = generateMealData({
    history: pumpHistory,
    profile,
    basalprofile: basalProfileForCob,
    clock,
    carbs: carbHistory,
    glucose: toGlucoseData(glucoseReadings),
  });
  // total.js tracks raw un-absorbed carbs (mealData.carbs) separately from
  // the deviation-confirmed mealCOB, and only the latter gets zeroed by its
  // "zombie-carb" safety net when recent glucose can't confirm absorption
  // (see cob.js's currentDeviation/maxDeviation null check). When that
  // happens right after carbs were logged, mealCOB reading 0 is
  // indistinguishable from "no carbs on board" unless we surface it —
  // AGENTS.md: never let a bad state silently feed the calculator.
  const cobPending = (mealData.carbs ?? 0) > 0 && (mealData.mealCOB ?? 0) === 0;

  const currenttemp = { duration: 0, rate: 0, temp: 'absolute' };
  const autosensData = { ratio: autosens.ratio };

  const rT = determineBasal(
    glucoseStatus,
    currenttemp,
    iobData,
    profile,
    autosensData,
    mealData,
    tempBasalFunctions,
    false, // microBolusAllowed — SMB is a pump-only feature, not applicable to MDI
    null, // reservoir_data
    now,
  );

  if (rT.error) {
    throw new Error(rT.error);
  }

  // determine-basal.js has its own early "CGM data is unchanged, doing
  // nothing" shortcut (glucose_status.delta/short_avgdelta/long_avgdelta
  // all ~0) that returns before ever computing predBGs — designed for a
  // pump deciding whether to touch a running temp basal, not a reason to
  // predict nothing. Replicated here (same fields/thresholds) so that when
  // it fires, the Dashboard chart still gets a flat continuation line —
  // which is exactly what oref0 itself concluded ("nothing is changing"),
  // not a fabricated guess.
  const tooFlat =
    glucoseStatus.glucose > 60 &&
    glucoseStatus.delta === 0 &&
    glucoseStatus.short_avgdelta > -1 &&
    glucoseStatus.short_avgdelta < 1 &&
    glucoseStatus.long_avgdelta > -1 &&
    glucoseStatus.long_avgdelta < 1;

  const predBGs: number[] | null =
    rT.predBGs?.COB ?? rT.predBGs?.IOB ?? (tooFlat ? Array(13).fill(glucoseStatus.glucose) : null);

  return {
    status: 'ok',
    eventualBG: rT.eventualBG ?? null,
    reason: rT.reason ?? '',
    carbsSuggested: rT.carbsSuggested ?? null,
    mdiExcessInsulin: rT.mdiExcessInsulin ?? null,
    iob: iobData[0]?.iob ?? 0,
    mealCOB: mealData.mealCOB ?? 0,
    cobPending,
    currentBasal,
    insufficientGlucoseForCOB,
    autosensRatio: autosens.ratio,
    autosensAdjustedISF: autosens.insufficientData ? null : (rT.ISF as number | undefined) ?? null,
    autosensInsufficientData: autosens.insufficientData,
    predBGs,
  };
}
