import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChartPoint } from '../components/GlucoseChart';
import type { GlucoseReading } from './glucose';
import { checkGlucoseAndNotify, readNotificationSettings, type NotificationSettings } from './notifications';
import { useGlucoseSource } from './useGlucoseSource';

// Lifted above the tab navigator (rather than owned by DashboardScreen)
// so any screen — Dashboard today, Trends later — can read the same live
// current BG / history without each starting its own xDrip+ poll or
// duplicating useGlucoseSource's state.

type XdripStatus = 'loading' | 'ok' | 'no-data' | 'error';

// count=144 covers ~2.5h at Libre's ~1/min cadence, or ~12h at a 5-min
// cadence — either way it's plenty for a short trend graph without
// hammering xDrip+'s local server.
const CGM_URL = 'http://127.0.0.1:17580/sgv.json?count=144';
const POLL_INTERVAL_MS = 30_000;

interface GlucoseContextValue {
  current: GlucoseReading | null;
  history: ChartPoint[];
  xdripStatus: XdripStatus;
  xdripError: string | null;
  reportBleLiveReading: (reading: GlucoseReading) => void;
  reportBleHistorySync: (readings: GlucoseReading[]) => void;
}

const GlucoseContext = createContext<GlucoseContextValue | null>(null);

export function GlucoseProvider({ children }: { children: ReactNode }) {
  const { current, history, reportReading, replaceSource } = useGlucoseSource();
  const [xdripStatus, setXdripStatus] = useState<XdripStatus>('loading');
  const [xdripError, setXdripError] = useState<string | null>(null);

  const fetchReading = useCallback(async () => {
    try {
      const response = await fetch(CGM_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        replaceSource('xdrip', []);
        setXdripStatus('no-data');
        return;
      }
      replaceSource('xdrip', data as GlucoseReading[]);
      setXdripStatus('ok');
    } catch (e) {
      setXdripError(e instanceof Error ? e.message : String(e));
      setXdripStatus('error');
    }
  }, [replaceSource]);

  useEffect(() => {
    fetchReading();
    const timer = setInterval(fetchReading, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchReading]);

  // Fires a local notification when a new reading crosses the user's
  // high/low thresholds (Settings > Notifications and Reminders) — see
  // lib/notifications.ts for the threshold/DND/cooldown logic itself.
  const lastCheckedReadingId = useRef<string | null>(null);
  useEffect(() => {
    if (!current) return;
    const readingKey = `${current.date}:${current.sgv}`;
    if (lastCheckedReadingId.current === readingKey) return;
    lastCheckedReadingId.current = readingKey;
    readNotificationSettings()
      .then((settings: NotificationSettings) => checkGlucoseAndNotify(current, settings))
      .catch((e) => console.error('Failed to check glucose notification thresholds:', e));
  }, [current]);

  const reportBleLiveReading = useCallback(
    (reading: GlucoseReading) => reportReading('ble', reading),
    [reportReading],
  );
  const reportBleHistorySync = useCallback(
    (readings: GlucoseReading[]) => replaceSource('ble', readings),
    [replaceSource],
  );

  return (
    <GlucoseContext.Provider
      value={{ current, history, xdripStatus, xdripError, reportBleLiveReading, reportBleHistorySync }}
    >
      {children}
    </GlucoseContext.Provider>
  );
}

export function useGlucose(): GlucoseContextValue {
  const ctx = useContext(GlucoseContext);
  if (!ctx) {
    throw new Error('useGlucose() must be called within a GlucoseProvider');
  }
  return ctx;
}
