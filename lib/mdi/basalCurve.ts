// Converts a long-acting (basal) insulin dose into a virtual "current
// basal rate" — the input oref0's determine-basal expects a pump to
// supply, which this app doesn't have. Kept intentionally simple (a
// normalized activity-weight curve per insulin type, not a full PK/PD
// simulation), matching the same "simplest auditable model first" choice
// already made for lib/iob.ts's linear IOB decay. Revisit if real-world
// use shows it's not accurate enough.
//
// Duration/peak values below are standard published literature figures,
// not this user's personal data — mdi-logger's own brief explicitly
// warns against inventing clinical defaults, so these are meant as
// starting points a settings screen can override, not values to trust
// blindly for real dosing decisions.

// 'other' covers any long-acting insulin without a published profile
// here (e.g. an uncommon brand, or a biosimilar with a different quoted
// duration) — its actual duration always comes from the dose's own
// `customDurationHours` (set when logging/scheduling it), never from
// DEFAULT_BASAL_CURVE_PROFILES.other, which exists only as a fallback if
// that's somehow missing.
export type LongActingInsulinType = 'glargine' | 'detemir' | 'degludec' | 'other';

export interface BasalCurveProfile {
  // Total hours the dose remains active. Degludec is genuinely ~42h
  // (ultra-long, ~flat); glargine ~24h; detemir is dose-dependent in
  // reality (roughly 18-24h) — 20h here is a mid-range default.
  durationHours: number;
  // Fraction of durationHours where activity peaks. null = no peak
  // (glargine/degludec are modeled as flat-topped trapezoids); detemir
  // has a mild, real peak, modeled as a simple triangle.
  peakFraction: number | null;
}

export const DEFAULT_BASAL_CURVE_PROFILES: Record<LongActingInsulinType, BasalCurveProfile> = {
  glargine: { durationHours: 24, peakFraction: null },
  detemir: { durationHours: 20, peakFraction: 0.3 },
  degludec: { durationHours: 42, peakFraction: null },
  // Flat-topped (no assumed peak) rather than guessing at a peaked shape
  // for an insulin this app has no published profile for — the neutral
  // default among the three known shapes.
  other: { durationHours: 24, peakFraction: null },
};

export interface BasalDose {
  type: LongActingInsulinType;
  units: number;
  injectedAt: string; // ISO 8601
  // Only meaningful when type === 'other' — the duration the person
  // entered for this specific dose. Ignored for the three known types,
  // which always use their own published duration above.
  customDurationHours?: number | null;
}

// Trapezoidal activity weight: ramps up over the first/last 10% of
// duration, flat in between. Normalized so its integral over
// [0, durationHours] is 1 (a probability density in units of 1/hour) —
// multiplying by the dose gives units/hour.
function trapezoidalWeight(elapsedHours: number, durationHours: number): number {
  if (elapsedHours < 0 || elapsedHours > durationHours) return 0;
  const rampHours = durationHours * 0.1;
  const height = 1 / (durationHours - rampHours);
  if (elapsedHours < rampHours) return height * (elapsedHours / rampHours);
  if (elapsedHours > durationHours - rampHours) {
    return height * ((durationHours - elapsedHours) / rampHours);
  }
  return height;
}

// Triangular activity weight peaking at peakFraction * durationHours.
// Normalized the same way (integral over [0, durationHours] is 1).
function triangularWeight(elapsedHours: number, durationHours: number, peakFraction: number): number {
  if (elapsedHours < 0 || elapsedHours > durationHours) return 0;
  const peakHours = durationHours * peakFraction;
  const height = 2 / durationHours;
  if (elapsedHours <= peakHours) return height * (elapsedHours / peakHours);
  return height * ((durationHours - elapsedHours) / (durationHours - peakHours));
}

function activityWeight(elapsedHours: number, profile: BasalCurveProfile): number {
  return profile.peakFraction == null
    ? trapezoidalWeight(elapsedHours, profile.durationHours)
    : triangularWeight(elapsedHours, profile.durationHours, profile.peakFraction);
}

// The virtual "current basal rate" (units/hour) from a single dose, at
// a given moment — this is what feeds determine-basal's `current_basal`
// input in place of a pump's adjustable rate.
export function basalRateFromDose(dose: BasalDose, atTime: Date, profileOverride?: Partial<BasalCurveProfile>): number {
  const base = DEFAULT_BASAL_CURVE_PROFILES[dose.type];
  // A per-dose customDurationHours (type === 'other') takes priority over
  // profileOverride — the latter is a global settings-driven override
  // mechanism (unused today), while this is per-dose data the person
  // entered when logging/scheduling that specific insulin.
  const durationHours =
    dose.type === 'other' && dose.customDurationHours != null
      ? dose.customDurationHours
      : profileOverride?.durationHours ?? base.durationHours;
  const profile: BasalCurveProfile = {
    durationHours,
    peakFraction: profileOverride?.peakFraction !== undefined ? profileOverride.peakFraction : base.peakFraction,
  };
  const elapsedHours = (atTime.getTime() - new Date(dose.injectedAt).getTime()) / (1000 * 60 * 60);
  return dose.units * activityWeight(elapsedHours, profile);
}

// Sums contributions from every dose still active at atTime — handles
// overlapping doses (e.g. daily degludec/detemir injections) by simple
// superposition rather than modeling true multi-dose steady-state
// pharmacokinetics.
export function currentBasalRate(
  doses: BasalDose[],
  atTime: Date,
  profileOverrides?: Partial<Record<LongActingInsulinType, Partial<BasalCurveProfile>>>,
): number {
  return doses.reduce((total, dose) => total + basalRateFromDose(dose, atTime, profileOverrides?.[dose.type]), 0);
}
