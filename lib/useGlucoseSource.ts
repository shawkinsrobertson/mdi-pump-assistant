import { useCallback, useRef, useState } from 'react';
import type { ChartPoint } from '../components/GlucoseChart';
import type { GlucoseReading } from './glucose';

const MAX_HISTORY_POINTS = 500;

// Single shared "current BG" + history state, fed by any number of
// sources (xDrip+ polling, a Bluetooth meter, …) instead of each source
// keeping its own parallel state that the UI would then have to
// reconcile. "Current" is always whichever known reading is newest by
// its own timestamp, not whichever source last reported — so a stale
// background poll can never clobber a fresher reading from another
// source, or vice versa.
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

  // For a one-off reading (e.g. a live Bluetooth meter notification).
  // sourceKey namespaces the id so different sources can never collide.
  const reportReading = useCallback(
    (sourceKey: string, reading: GlucoseReading) => {
      byId.current.set(`${sourceKey}:${reading._id}`, reading);
      commit();
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
    },
    [commit],
  );

  return { current, history, reportReading, replaceSource };
}
