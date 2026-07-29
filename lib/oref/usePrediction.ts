import { useCallback, useEffect, useState } from 'react';
import { runPrediction, type PredictionResult } from './runPrediction';

// Shared by DashboardScreen (IOB/COB stat) and PredictionCallout (the
// simplified summary) so both read from one fetch instead of each
// running its own runPrediction() — this used to live inside
// PredictionCallout alone before the IOB/COB stat needed the same data.
export function usePrediction(refreshToken: number) {
  const [result, setResult] = useState<PredictionResult | null>(null);
  // Distinct from "still loading" — a thrown error must never collapse
  // into the same silent-null state as "haven't checked yet", or a real
  // failure becomes invisible instead of surfaced (see AGENTS.md: never
  // let a bad state silently feed the calculator).
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const check = useCallback(() => {
    runPrediction()
      .then((r) => {
        setResult(r);
        setError(null);
      })
      .catch((e) => {
        setResult(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setChecked(true));
  }, []);

  useEffect(() => {
    check();
  }, [check, refreshToken]);

  return { result, error, checked };
}
