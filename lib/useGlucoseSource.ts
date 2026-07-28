import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartPoint } from '../components/GlucoseChart';
import { getReadingsSinceWithSource, insertReadings } from './db/glucoseReadings';
import type { GlucoseReading } from './glucose';

const MAX_HISTORY_POINTS = 500;

// How far back to hydrate from the local DB on mount. Deliberately much
// shorter than glucose_readings' own 90-day retention (lib/db/glucoseReadings.ts)
// — this only feeds the short live trend chart and MAX_HISTORY_POINTS
// below, not the Trends screen, which queries the DB directly for
// whatever longer window it needs.
const HYDRATE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Single shared "current BG" + history state, fed by any number of
// sources (xDrip+ polling, a Bluetooth meter, …) instead of each source
// keeping its own parallel state that the UI would then have to
// reconcile. "Current" is always whichever known reading is newest by
// its own timestamp, not whichever source last reported — so a stale
// background poll can never clobber a fresher reading from another
// source, or vice versa.
//
// Every reading is also durably persisted (lib/db/glucoseReadings.ts) and
// the map is hydrated from that store on mount, so a restart doesn't lose
// history the oref0 orchestration's COB detection depends on — the same
// requirement AndroidAPS solves by persisting every received CGM value
// rather than keeping it in memory only.
export function useGlucoseSource() {
  const [current, setCurrent] = useState<GlucoseReading | null>(null);
  const [history, setHistory] = useState<ChartPoint[]>([]);
  const byId = useRef(new Map<string, GlucoseReading>());

  const commit = useCallback(() => {
    const all = Array.from(byId.current.values()).sort((a, b) => a.date - b.date);
    const trimmed = all.slice(-MAX_HISTORY_POINTS);
    setHistory(trimmed.map((r) => ({ time: r.date, sgv: r.sgv })));
    setCurrent(trimmed.length > 0 ? trimmed[trimmed.length - 1] : null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getReadingsSinceWithSource(Date.now() - HYDRATE_WINDOW_MS)
      .then((rows) => {
        if (cancelled) return;
        // Rebuild the same "source:id" map key reportReading/replaceSource
        // use, so a later live update from that same source naturally
        // overwrites its own hydrated entry instead of duplicating it.
        for (const { source, reading } of rows) {
          byId.current.set(`${source}:${reading._id}`, reading);
        }
        commit();
      })
      .catch((e) => console.error('Failed to hydrate glucose history from DB:', e));
    return () => {
      cancelled = true;
    };
  }, [commit]);

  // For a one-off reading (e.g. a live Bluetooth meter notification).
  // sourceKey namespaces the id so different sources can never collide.
  const reportReading = useCallback(
    (sourceKey: string, reading: GlucoseReading) => {
      byId.current.set(`${sourceKey}:${reading._id}`, reading);
      commit();
      insertReadings(sourceKey, [reading]).catch((e) =>
        console.error('Failed to persist glucose reading:', e),
      );
    },
    [commit],
  );

  // For a source that reports its whole known window at once (xDrip+'s
  // poll, or a Bluetooth meter's full RACP history sync): replaces
  // everything previously known from that source, without touching any
  // other source's readings.
  const replaceSource = useCallback(
    (sourceKey: string, readings: GlucoseReading[]) => {
      const prefix = `${sourceKey}:`;
      for (const id of Array.from(byId.current.keys())) {
        if (id.startsWith(prefix)) byId.current.delete(id);
      }
      for (const r of readings) byId.current.set(`${prefix}${r._id}`, r);
      commit();
      insertReadings(sourceKey, readings).catch((e) =>
        console.error('Failed to persist glucose readings:', e),
      );
    },
    [commit],
  );

  return { current, history, reportReading, replaceSource };
}
