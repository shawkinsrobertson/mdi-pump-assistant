import type { Treatment } from './db/treatments';

// Placeholder IOB model: linear decay of each bolus dose to zero over
// `diaHours`, chosen for now because it's the easiest model to audit by
// hand — mdi-logger's own brief explicitly flags "IOB model: exponential
// vs linear" as a decision to confirm with the human before relying on
// it, rather than a default to silently upgrade later without saying so.
//
// Every treatment row today is a rapid-acting bolus (no basal/long-acting
// concept exists in the schema yet — see lib/db/treatments.ts), so every
// row with a non-null insulin value counts toward IOB.
export function computeIOB(treatments: Treatment[], diaHours: number, atTime: number = Date.now()): number {
  if (diaHours <= 0) return 0;

  let total = 0;
  for (const t of treatments) {
    if (t.insulin == null || t.insulin <= 0) continue;
    const elapsedHours = (atTime - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);
    if (elapsedHours < 0 || elapsedHours >= diaHours) continue;
    total += t.insulin * (1 - elapsedHours / diaHours);
  }
  return total;
}
