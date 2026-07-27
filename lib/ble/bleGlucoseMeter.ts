import { fromByteArray, toByteArray } from 'base64-js';
import { BleManager, type Device, type State } from 'react-native-ble-plx';
import { isOperationCancelledError } from './errors';
import { GLUCOSE_MEASUREMENT_UUID, GLUCOSE_SERVICE_UUID, RECORD_ACCESS_CONTROL_POINT_UUID } from './gatt';
import { parseGlucoseMeasurement, type BleGlucoseReading } from './parseGlucoseMeasurement';
import { buildReportAllRecordsCommand, describeRacpResponseCode, parseRacpResponse, RacpResponseCode } from './racp';

// One manager for the app's lifetime — react-native-ble-plx expects a
// single BleManager instance, not one per screen/hook. Created lazily
// (not at module load) so importing this file never touches the native
// BLE module until a caller actually tries to use Bluetooth — the native
// module only exists in a dev-client/production build, not e.g. web
// preview, and a missing module should fail at the point of use rather
// than crash the whole app at launch.
let managerInstance: BleManager | null = null;
function getManager(): BleManager {
  if (!managerInstance) managerInstance = new BleManager();
  return managerInstance;
}

export function bleState(): Promise<State> {
  return getManager().state();
}

export function onBleStateChange(listener: (state: State) => void) {
  return getManager().onStateChange(listener, true);
}

// Filtering the scan to GLUCOSE_SERVICE_UUID is what makes this generic
// across compliant meters (Contour Next One and others) instead of
// per-brand device detection — only devices advertising the standard
// Glucose Service show up at all.
export function scanForMeters(onFound: (device: Device) => void, onError: (error: Error) => void) {
  getManager().startDeviceScan([GLUCOSE_SERVICE_UUID], null, (error, device) => {
    if (error) {
      onError(error);
      return;
    }
    if (device) onFound(device);
  });
}

export function stopScan() {
  getManager().stopDeviceScan();
}

export async function connectToMeter(deviceId: string): Promise<Device> {
  const device = await getManager().connectToDevice(deviceId);
  await device.discoverAllServicesAndCharacteristics();
  return device;
}

export async function disconnectMeter(deviceId: string): Promise<void> {
  await getManager().cancelDeviceConnection(deviceId).catch(() => {});
}

// Subscribes to new readings as the meter takes them. This one
// subscription is meant to live for the whole connection — including
// through a fetchStoredRecords() call, which delivers historical records
// over this same characteristic. Tearing it down and re-creating it
// around every sync (an earlier version of this code did that) both
// misreports old records as "current" and, worse, adds exactly the kind
// of overlapping GATT operations on one connection that triggers Android
// GATT_INTERNAL_ERROR — removing a monitor subscription cancels its
// transaction asynchronously, which can still be in flight when a new
// subscription for the same characteristic is created moments later.
// Callers should keep one subscription for the connection's lifetime and
// use fetchStoredRecords()'s own readings callback to tell live readings
// apart from a sync's historical burst, rather than remove/recreate.
export function monitorLiveReadings(
  device: Device,
  onReading: (reading: BleGlucoseReading) => void,
  onError: (error: Error) => void,
) {
  return device.monitorCharacteristicForService(
    GLUCOSE_SERVICE_UUID,
    GLUCOSE_MEASUREMENT_UUID,
    (error, characteristic) => {
      if (error) {
        if (isOperationCancelledError(error)) return; // expected when this subscription is intentionally removed (disconnect/cleanup)
        onError(error);
        return;
      }
      if (!characteristic?.value) return;
      const reading = parseGlucoseMeasurement(toByteArray(characteristic.value));
      if (reading) onReading(reading);
    },
  );
}

const RACP_TIMEOUT_MS = 30_000;
const GATT_SETTLE_MS = 300; // gives the RACP indication's descriptor write a moment to settle before the command write, same overlapping-GATT-operation reasoning as above

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Triggers Record Access Control Point "Report Stored Records" / "All
// records". Resolves once the meter indicates completion (or rejects on
// error/timeout) — it does NOT collect the records itself. The matching
// Glucose Measurement notifications arrive over the same characteristic
// monitorLiveReadings is already subscribed to; the caller is expected to
// route readings into a temporary buffer while this promise is pending
// rather than have this function open a second, competing subscription.
export function fetchStoredRecords(device: Device): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let racpSub: { remove(): void } | null = null;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      racpSub?.remove();
      action();
    };

    const timeout = setTimeout(() => {
      finish(() => reject(new Error('Timed out waiting for the meter to report stored records')));
    }, RACP_TIMEOUT_MS);

    (async () => {
      racpSub = device.monitorCharacteristicForService(
        GLUCOSE_SERVICE_UUID,
        RECORD_ACCESS_CONTROL_POINT_UUID,
        (error, characteristic) => {
          if (settled) return;
          if (error) {
            if (isOperationCancelledError(error)) return;
            finish(() => reject(error));
            return;
          }
          if (!characteristic?.value) return;
          const response = parseRacpResponse(toByteArray(characteristic.value));
          if (
            response.responseCode === RacpResponseCode.Success ||
            response.responseCode === RacpResponseCode.NoRecordsFound
          ) {
            finish(() => resolve());
          } else {
            finish(() => reject(new Error(`Meter reported: ${describeRacpResponseCode(response.responseCode)}`)));
          }
        },
      );
      await delay(GATT_SETTLE_MS);
      if (settled) return;

      try {
        await device.writeCharacteristicWithResponseForService(
          GLUCOSE_SERVICE_UUID,
          RECORD_ACCESS_CONTROL_POINT_UUID,
          fromByteArray(buildReportAllRecordsCommand()),
        );
      } catch (error) {
        finish(() => reject(error));
      }
    })();
  });
}
