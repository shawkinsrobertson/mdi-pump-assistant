import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Device } from 'react-native-ble-plx';
import {
  bleState,
  connectToMeter,
  disconnectMeter,
  fetchStoredRecords,
  scanForMeters,
  stopScan,
} from '../lib/ble/bleGlucoseMeter';
import { describeBleError } from '../lib/ble/errors';
import { requestBlePermissions } from '../lib/ble/permissions';
import type { BleGlucoseReading } from '../lib/ble/parseGlucoseMeasurement';
import type { GlucoseReading } from '../lib/glucose';
import { useTheme } from '../lib/ThemeContext';

type Status =
  | 'idle'
  | 'no-permission'
  | 'bluetooth-off'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'error';

interface BleMeterModalProps {
  visible: boolean;
  onClose: () => void;
  onLiveReading: (reading: GlucoseReading) => void;
  onHistorySync: (readings: GlucoseReading[]) => void;
}

export function BleMeterModal({ visible, onClose, onLiveReading, onHistorySync }: BleMeterModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [status, setStatus] = useState<Status>('idle');
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [lastReading, setLastReading] = useState<BleGlucoseReading | null>(null);
  const [syncCount, setSyncCount] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const liveSubRef = useRef<{ remove(): void } | null>(null);
  // While a sync is running, the single persistent measurement
  // subscription's readings get redirected here instead of treated as
  // "live" — see monitorLiveReadings/fetchStoredRecords in
  // bleGlucoseMeter.ts for why that subscription is never torn down and
  // recreated around a sync.
  const isSyncingRef = useRef(false);
  const syncBufferRef = useRef<BleGlucoseReading[]>([]);

  // Scanning is tied to the modal being open. Live monitoring is tied to
  // being connected, not to modal visibility — closing this modal while
  // connected should keep readings flowing into the shared state, not
  // silently stop updating "current BG" until the user reopens it.
  // Only registers a cleanup while actually visible, so mounting this
  // component (which happens once, hidden, as soon as the app launches)
  // never touches the native BLE module on its own.
  useEffect(() => {
    if (!visible) return;
    return () => stopScan();
  }, [visible]);

  useEffect(() => {
    return () => {
      liveSubRef.current?.remove();
      liveSubRef.current = null;
    };
  }, []);

  const startScan = useCallback(async () => {
    setErrorMessage(null);
    try {
      const btState = await bleState();
      if (btState !== 'PoweredOn') {
        setStatus('bluetooth-off');
        return;
      }

      const granted = await requestBlePermissions();
      if (!granted) {
        setStatus('no-permission');
        return;
      }

      setDevices([]);
      setStatus('scanning');
      scanForMeters(
        (device) => {
          setDevices((prev) => (prev.some((d) => d.id === device.id) ? prev : [...prev, device]));
        },
        (error) => {
          setStatus('error');
          setErrorMessage(describeBleError(error));
        },
      );
    } catch (error) {
      setStatus('error');
      setErrorMessage(describeBleError(error));
    }
  }, []);

  useEffect(() => {
    if (visible && status === 'idle') {
      startScan();
    }
  }, [visible, status, startScan]);

  const handleConnect = useCallback(
    async (device: Device) => {
      stopScan();
      setStatus('connecting');
      setErrorMessage(null);
      try {
        const { device: connected, liveReadingsSubscription } = await connectToMeter(
          device.id,
          (reading) => {
            if (isSyncingRef.current) {
              syncBufferRef.current.push(reading);
              return;
            }
            setLastReading(reading);
            onLiveReading(reading);
          },
          (error) => {
            setErrorMessage(describeBleError(error));
          },
        );
        setConnectedDevice(connected);
        setStatus('connected');
        liveSubRef.current = liveReadingsSubscription;
      } catch (error) {
        setStatus('error');
        setErrorMessage(describeBleError(error));
      }
    },
    [onLiveReading],
  );

  const handleSyncHistory = useCallback(async () => {
    if (!connectedDevice) return;
    // Redirect the persistent measurement subscription's readings into a
    // buffer instead of treating them as live, for the duration of the
    // RACP fetch — no subscription is torn down or recreated here.
    isSyncingRef.current = true;
    syncBufferRef.current = [];
    setStatus('syncing');
    setErrorMessage(null);
    try {
      await fetchStoredRecords(connectedDevice);
      const records = syncBufferRef.current;
      setSyncCount(records.length);
      onHistorySync(records);
      setStatus('connected');
    } catch (error) {
      setErrorMessage(describeBleError(error));
    } finally {
      isSyncingRef.current = false;
      if (status !== 'error') setStatus('connected');
    }
  }, [connectedDevice, onHistorySync, status]);

  const handleDisconnect = useCallback(async () => {
    liveSubRef.current?.remove();
    liveSubRef.current = null;
    if (connectedDevice) await disconnectMeter(connectedDevice.id);
    setConnectedDevice(null);
    setLastReading(null);
    setSyncCount(null);
    setStatus('idle');
  }, [connectedDevice]);

  const handleClose = useCallback(() => {
    stopScan();
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        <Text style={styles.title}>Bluetooth Glucose Meter</Text>

        {status === 'bluetooth-off' && <Text style={styles.message}>Turn on Bluetooth and try again.</Text>}
        {status === 'no-permission' && (
          <Text style={styles.message}>Bluetooth permission is required to scan for meters.</Text>
        )}
        {status === 'scanning' && (
          <View style={styles.row}>
            <ActivityIndicator />
            <Text style={styles.message}>Scanning for glucose meters…</Text>
          </View>
        )}
        {status === 'connecting' && (
          <View style={styles.row}>
            <ActivityIndicator />
            <Text style={styles.message}>Connecting…</Text>
          </View>
        )}

        {(status === 'scanning' || status === 'error' || status === 'idle') && !connectedDevice && (
          <FlatList
            style={styles.list}
            data={devices}
            keyExtractor={(d) => d.id}
            renderItem={({ item }) => (
              <Pressable style={styles.deviceRow} onPress={() => handleConnect(item)}>
                <Text style={styles.deviceName}>{item.name ?? item.id}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              status === 'scanning' ? null : <Text style={styles.message}>No compatible meters found yet.</Text>
            }
          />
        )}

        {connectedDevice && (
          <View style={styles.connectedPanel}>
            <Text style={styles.deviceName}>Connected: {connectedDevice.name ?? connectedDevice.id}</Text>
            {lastReading && (
              <Text style={styles.message}>
                Last reading: {lastReading.sgv} mg/dL at {new Date(lastReading.date).toLocaleTimeString()}
              </Text>
            )}
            {syncCount !== null && <Text style={styles.message}>Synced {syncCount} stored record(s).</Text>}

            <Pressable
              style={[styles.button, status === 'syncing' && styles.buttonDisabled]}
              disabled={status === 'syncing'}
              onPress={handleSyncHistory}
            >
              {status === 'syncing' ? (
                <ActivityIndicator color={colors.text.inverse} />
              ) : (
                <Text style={styles.buttonText}>Sync history</Text>
              )}
            </Pressable>

            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={handleDisconnect}>
              <Text style={styles.buttonText}>Disconnect</Text>
            </Pressable>
          </View>
        )}

        {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={handleClose}>
          <Text style={styles.buttonText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg.primary,
      padding: 24,
      paddingTop: 60,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 16,
      color: colors.text.primary,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    message: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 8,
    },
    list: {
      flexGrow: 0,
      marginBottom: 16,
    },
    deviceRow: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    deviceName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    connectedPanel: {
      marginBottom: 16,
    },
    button: {
      backgroundColor: colors.action.primaryBg,
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 12,
    },
    buttonSecondary: {
      backgroundColor: colors.action.secondaryBg,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: colors.text.inverse,
      fontWeight: '600',
    },
    error: {
      color: colors.status.danger,
      fontSize: 13,
      marginTop: 8,
      marginBottom: 8,
    },
  });
}
