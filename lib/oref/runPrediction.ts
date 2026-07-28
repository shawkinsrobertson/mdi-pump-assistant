// Thin I/O shell around predictionCore.ts's pure computePrediction(): fetches
// real glucose/treatment/basal-dose history and settings, then hands them
// off. Kept separate from predictionCore.ts so the pure logic can be unit
// tested under jest without pulling in expo-sqlite (see
// lib/oref/__tests__/runPrediction.test.js, which imports predictionCore.ts
// directly).
import { getRecentBasalDosesSince } from '../db/basalDoses';
import { getReadingsSince } from '../db/glucoseReadings';
import { getTreatmentsSince } from '../db/treatments';
import { readSettings } from '../settings';
import { computePrediction, type PredictionResult } from './predictionCore';

export type { PredictionResult } from './predictionCore';

// How far back to look for glucose/treatment history. Widened to 24h to
// cover autosens's own lookback (it wants up to 24h of non-excluded
// deviations); this is a superset of what COB (6h) and IOB need, and
// extra older history is harmless there since both filter their own
// relevant windows internally. Matches glucose_readings' own 24h
// retention ceiling, so this always fetches everything we have.
const HISTORY_LOOKBACK_MS = 24 * 60 * 60 * 1000;

// Basal doses whose activity curve could still be non-zero right now —
// widened past degludec's ~42h duration with margin; costs nothing since
// basalRateFromDose returns 0 outside a dose's own duration.
const BASAL_DOSE_LOOKBACK_MS = 48 * 60 * 60 * 1000;

interface RunPredictionDeps {
  now?: Date;
}

export async function runPrediction({ now = new Date() }: RunPredictionDeps = {}): Promise<PredictionResult> {
  const settings = await readSettings();
  const since = new Date(now.getTime() - HISTORY_LOOKBACK_MS).toISOString();
  const [glucoseReadings, treatments, basalDoses] = await Promise.all([
    getReadingsSince(now.getTime() - HISTORY_LOOKBACK_MS),
    getTreatmentsSince(since),
    getRecentBasalDosesSince(now.getTime() - BASAL_DOSE_LOOKBACK_MS),
  ]);

  return computePrediction({ settings, glucoseReadings, treatments, basalDoses, now });
}
