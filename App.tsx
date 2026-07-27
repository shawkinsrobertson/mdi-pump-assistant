import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GlucoseChart, type ChartPoint } from './components/GlucoseChart';
import { arrowForDirection, bgColor, formatClockTime, isStale, type GlucoseReading } from './lib/glucose';

type FetchStatus = 'loading' | 'ok' | 'no-data' | 'error';

// count=144 covers ~2.5h at Libre's ~1/min cadence, or ~12h at a 5-min
// cadence — either way it's plenty for a short trend graph without
// hammering xDrip+'s local server.
const CGM_URL = 'http://127.0.0.1:17580/sgv.json?count=144';
const POLL_INTERVAL_MS = 30_000;

export default function App() {
  const [current, setCurrent] = useState<GlucoseReading | null>(null);
  const [history, setHistory] = useState<ChartPoint[]>([]);
  const [status, setStatus] = useState<FetchStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function fetchReading() {
    try {
      const response = await fetch(CGM_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        setCurrent(null);
        setHistory([]);
        setStatus('no-data');
        return;
      }
      const readings = data as GlucoseReading[];
      setCurrent(readings[0]); // xDrip+ returns newest-first
      setHistory(
        readings
          .map((r) => ({ time: r.date, sgv: r.sgv }))
          .reverse(), // oldest → newest, for left-to-right plotting
      );
      setStatus('ok');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMessage(msg);
      setStatus('error');
    }
  }

  useEffect(() => {
    fetchReading();
    const timer = setInterval(fetchReading, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>CGM — xDrip+</Text>

      {status === 'loading' && <ActivityIndicator size="large" color="#333" />}

      {status === 'ok' && current !== null && (
        <>
          <View style={styles.headerRow}>
            <Text style={[styles.glucose, { color: bgColor(current.sgv) }]}>{current.sgv}</Text>
            <Text style={styles.arrow}>{arrowForDirection(current.direction)}</Text>
          </View>
          <Text style={styles.unit}>mg/dL</Text>
          <View style={styles.statusRow}>
            <Text style={styles.detail}>{formatClockTime(current.date)}</Text>
            {isStale(current) && <Text style={styles.staleBadge}>STALE</Text>}
          </View>

          <View style={styles.chartWrap}>
            <GlucoseChart history={history} />
          </View>
        </>
      )}

      {status === 'no-data' && <Text style={styles.message}>No recent CGM data from xDrip+.</Text>}

      {status === 'error' && (
        <>
          <Text style={styles.error}>Failed to reach xDrip+</Text>
          <Text style={styles.errorDetail}>{errorMessage}</Text>
          <Text style={styles.hint}>
            If this URL works in the phone browser but not here, check that
            usesCleartextTraffic is enabled in app.json and rebuild the dev
            client.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  label: {
    fontSize: 14,
    color: '#999',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  glucose: {
    fontSize: 96,
    fontWeight: 'bold',
  },
  arrow: {
    fontSize: 40,
    fontWeight: '600',
    color: '#111',
    marginTop: 16,
  },
  unit: {
    fontSize: 20,
    color: '#555',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  detail: {
    fontSize: 16,
    color: '#555',
  },
  staleBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    letterSpacing: 0.5,
  },
  chartWrap: {
    width: '100%',
  },
  message: {
    fontSize: 18,
    color: '#888',
    textAlign: 'center',
  },
  error: {
    fontSize: 20,
    color: '#c00',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 14,
    color: '#c00',
    marginBottom: 12,
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    lineHeight: 18,
  },
});
