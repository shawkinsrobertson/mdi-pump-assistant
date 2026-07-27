import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BasalDoseModal } from './components/BasalDoseModal';
import { BleMeterModal } from './components/BleMeterModal';
import { GlucoseChart } from './components/GlucoseChart';
import { LogbookModal } from './components/LogbookModal';
import { QuickLogModal } from './components/QuickLogModal';
import { SettingsModal } from './components/SettingsModal';
import { arrowForDirection, bgColor, formatClockTime, isStale, type GlucoseReading } from './lib/glucose';
import { useGlucoseSource } from './lib/useGlucoseSource';

type XdripStatus = 'loading' | 'ok' | 'no-data' | 'error';

// count=144 covers ~2.5h at Libre's ~1/min cadence, or ~12h at a 5-min
// cadence — either way it's plenty for a short trend graph without
// hammering xDrip+'s local server.
const CGM_URL = 'http://127.0.0.1:17580/sgv.json?count=144';
const POLL_INTERVAL_MS = 30_000;

export default function App() {
  // Shared "current BG" + history, fed by both xDrip+ polling and any
  // connected Bluetooth meter — see lib/useGlucoseSource.ts. Neither
  // source keeps its own parallel state.
  const { current, history, reportReading, replaceSource } = useGlucoseSource();
  const [xdripStatus, setXdripStatus] = useState<XdripStatus>('loading');
  const [xdripError, setXdripError] = useState<string | null>(null);
  const [bleModalVisible, setBleModalVisible] = useState(false);
  const [quickLogVisible, setQuickLogVisible] = useState(false);
  const [logbookVisible, setLogbookVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [basalDoseVisible, setBasalDoseVisible] = useState(false);

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

  const handleBleLiveReading = useCallback(
    (reading: GlucoseReading) => reportReading('ble', reading),
    [reportReading],
  );
  const handleBleHistorySync = useCallback(
    (readings: GlucoseReading[]) => replaceSource('ble', readings),
    [replaceSource],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>CGM — xDrip+</Text>

      {current === null && xdripStatus === 'loading' && <ActivityIndicator size="large" color="#333" />}

      {current !== null && (
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

      {current === null && xdripStatus === 'no-data' && (
        <Text style={styles.message}>No recent CGM data from xDrip+.</Text>
      )}

      {current === null && xdripStatus === 'error' && (
        <>
          <Text style={styles.error}>Failed to reach xDrip+</Text>
          <Text style={styles.errorDetail}>{xdripError}</Text>
          <Text style={styles.hint}>
            If this URL works in the phone browser but not here, check that
            usesCleartextTraffic is enabled in app.json and rebuild the dev
            client.
          </Text>
        </>
      )}

      {current !== null && xdripStatus === 'error' && (
        <Text style={styles.xdripNote}>xDrip+ poll failing: {xdripError}</Text>
      )}

      <View style={styles.actionsRow}>
        <Pressable style={styles.actionButton} onPress={() => setQuickLogVisible(true)}>
          <Text style={styles.actionButtonText}>Quick Log</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => setLogbookVisible(true)}>
          <Text style={styles.actionButtonText}>Logbook</Text>
        </Pressable>
      </View>
      <View style={styles.actionsRow}>
        <Pressable style={styles.actionButton} onPress={() => setBleModalVisible(true)}>
          <Text style={styles.actionButtonText}>Connect meter</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => setSettingsVisible(true)}>
          <Text style={styles.actionButtonText}>Settings</Text>
        </Pressable>
      </View>
      <View style={styles.actionsRow}>
        <Pressable style={styles.actionButton} onPress={() => setBasalDoseVisible(true)}>
          <Text style={styles.actionButtonText}>Log Basal Dose</Text>
        </Pressable>
      </View>

      <BleMeterModal
        visible={bleModalVisible}
        onClose={() => setBleModalVisible(false)}
        onLiveReading={handleBleLiveReading}
        onHistorySync={handleBleHistorySync}
      />
      <QuickLogModal
        visible={quickLogVisible}
        onClose={() => setQuickLogVisible(false)}
        currentBG={current?.sgv ?? null}
      />
      <LogbookModal visible={logbookVisible} onClose={() => setLogbookVisible(false)} />
      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      <BasalDoseModal visible={basalDoseVisible} onClose={() => setBasalDoseVisible(false)} />
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
  xdripNote: {
    fontSize: 12,
    color: '#c00',
    textAlign: 'center',
    marginTop: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  actionButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
