// Ported from the web dashboard's bolus wizard (meal dose + correction −
// IOB), kept as pure functions per AGENTS.md's "all dose/IOB/COB math
// lives in pure, unit-tested functions" rule.

export function roundToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(increment) || increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

export interface BolusWizardInput {
  carbs: number;
  currentBG: number | null;
  iob: number;
  carbRatio: number;
  isf: number;
  targetBG: number;
  penIncrement: number;
}

export interface BolusWizardResult {
  mealDose: number;
  correction: number;
  iob: number;
  rawTotal: number;
  suggested: number; // rounded to penIncrement, clamped to >= 0
}

export function computeBolusWizard(input: BolusWizardInput): BolusWizardResult {
  const mealDose = input.carbRatio > 0 ? input.carbs / input.carbRatio : 0;
  const correction =
    input.currentBG != null && input.currentBG > input.targetBG && input.isf > 0
      ? (input.currentBG - input.targetBG) / input.isf
      : 0;
  const rawTotal = mealDose + correction - input.iob;
  const suggested = Math.max(0, roundToIncrement(rawTotal, input.penIncrement));
  return { mealDose, correction, iob: input.iob, rawTotal, suggested };
}
