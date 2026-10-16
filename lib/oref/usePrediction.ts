import { useEffect, useRef, useState } from 'react';
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

  // Guards against an out-of-order resolution: refreshToken can bump more
  // than once in quick succession (log a dose, then immediately refocus
  // the tab; or the dose-triggered refresh races the 60s decay timer),
  // firing overlapping runPrediction() calls with no guarantee the one
  // that *started* first also *finishes* first — SQLite/async timing
  // varies in ways a fast local jest run never exercises. Without this,
  // a slower, now-stale call finishing after a faster, newer one would
  // silently clobber the correct result with an outdated one — surfacing
  // as "IOB doesn't update for a subsequent dose" (the fresher result got
  // overwritten right back to the pre-dose value) or "COB reverts to
  // waiting on CGM data after navigating away and back" (a stale pending
  // result from an earlier, slower in-flight call landing last).
  const latestRequestId = useRef(0);

  useEffect(() => {
    const requestId = ++latestRequestId.current;
    runPrediction()
      .then((r) => {
        if (requestId !== latestRequestId.current) return; // superseded by a newer request
        setResult(r);
        setError(null);
      })
      .catch((e) => {
        if (requestId !== latestRequestId.current) return;
        setResult(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (requestId === latestRequestId.current) setChecked(true);
      });
  }, [refreshToken]);

  return { result, error, checked };
}
