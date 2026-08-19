import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChartPoint } from '../components/GlucoseChart';
import type { GlucoseReading } from './glucose';
import { fetchNightscoutEntries } from './nightscout/client';
import { checkGlucoseAndNotify, readNotificationSettings, type NotificationSettings } from './notifications';
import { useSettings, type GlucoseSource } from './settings';
import { useGlucoseSource } from './useGlucoseSource';

// Lifted above the tab navigator (rather than owned by DashboardScreen)
// so any screen — Dashboard today, Trends later — can read the same live
// current BG / history without each starting its own CGM poll or
// duplicating useGlucoseSource's state.

type CgmStatus = 'loading' | 'ok' | 'no-data' | 'error';

// count=144 covers ~2.5h at Libre's ~1/min cadence, or ~12h at a 5-min
// cadence — either way it's plenty for a short trend graph without
// hammering either poll target.
const CGM_ENTRY_COUNT = 144;
const XDRIP_URL = `http://127.0.0.1:17580/sgv.json?count=${CGM_ENTRY_COUNT}`;
const POLL_INTERVAL_MS = 30_000;

interface GlucoseContextValue {
  current: GlucoseReading | null;
  history: ChartPoint[];
  glucoseSource: GlucoseSource;
  cgmStatus: CgmStatus;
  cgmError: string | null;
  reportBleLiveReading: (reading: GlucoseReading) => void;
  reportBleHistorySync: (readings: GlucoseReading[]) => void;
}

const GlucoseContext = createContext<GlucoseContextValue | null>(null);

export function GlucoseProvider({ children }: { children: ReactNode }) {
  const { current, history, reportReading, replaceSource } = useGlucoseSource();
  const [settings, , settingsLoaded] = useSettings();
  const [cgmStatus, setCgmStatus] = useState<CgmStatus>('loading');
  const [cgmError, setCgmError] = useState<string | null>(null);

  // Deliberately mutually exclusive with Nightscout — see
  // Settings.glucoseSource's own comment (lib/settings.ts) for why running
  // both isn't just "extra redundancy": they typically mirror the same
  // underlying sensor data, and there's no cross-source dedup, so both
  // active at once would double-ingest one real glucose curve under two
  // different ids.
  const fetchReading = useCallback(async () => {
    if (settings.glucoseSource === 'nightscout') {
      if (!settings.nightscoutUrl || !settings.nightscoutToken) {
        setCgmError('Nightscout URL and token not configured — set them in Settings > Integrations.');
        setCgmStatus('error');
        return;
      }
      try {
        const data = await fetchNightscoutEntries(settings.nightscoutUrl, settings.nightscoutToken, CGM_ENTRY_COUNT);
        if (data.length === 0) {
          replaceSource('nightscout', []);
          setCgmStatus('no-data');
          return;
        }
        replaceSource('nightscout', data);
        setCgmStatus('ok');
      } catch (e) {
        setCgmError(e instanceof Error ? e.message : String(e));
        setCgmStatus('error');
      }
      return;
    }

    try {
      const response = await fetch(XDRIP_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        replaceSource('xdrip', []);
        setCgmStatus('no-data');
        return;
      }
      replaceSource('xdrip', data as GlucoseReading[]);
      setCgmStatus('ok');
    } catch (e) {
      setCgmError(e instanceof Error ? e.message : String(e));
      setCgmStatus('error');
    }
  }, [replaceSource, settings.glucoseSource, settings.nightscoutUrl, settings.nightscoutToken]);

  useEffect(() => {
    if (!settingsLoaded) return; // avoid a spurious xDrip+ poll before the real glucoseSource setting loads
    fetchReading();
    const timer = setInterval(fetchReading, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchReading, settingsLoaded]);

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
      value={{
        current,
        history,
        glucoseSource: settings.glucoseSource,
        cgmStatus,
        cgmError,
        reportBleLiveReading,
        reportBleHistorySync,
      }}
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
