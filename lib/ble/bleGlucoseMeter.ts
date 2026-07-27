import { fromByteArray, toByteArray } from 'base64-js';
import { BleManager, type Device, type State } from 'react-native-ble-plx';
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

// Subscribes to new readings as the meter takes them. Callers must remove
// this subscription before calling fetchStoredRecords — RACP delivers
// historical records over this same characteristic, and a live subscription
// left running during a sync would misreport old records as new "current"
// values.
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

// One-shot fetch of every record the meter has stored (Record Access
// Control Point: "Report Stored Records" / "All records"). The meter
// streams matching records as Glucose Measurement notifications, then
// indicates completion — or an error — on the RACP characteristic itself.
export function fetchStoredRecords(device: Device): Promise<BleGlucoseReading[]> {
  return new Promise((resolve, reject) => {
    const collected: BleGlucoseReading[] = [];
    let settled = false;
    let measurementSub: { remove(): void } | null = null;
    let racpSub: { remove(): void } | null = null;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      measurementSub?.remove();
      racpSub?.remove();
      action();
    };

    const timeout = setTimeout(() => {
      finish(() => reject(new Error('Timed out waiting for the meter to report stored records')));
    }, RACP_TIMEOUT_MS);

    measurementSub = device.monitorCharacteristicForService(
      GLUCOSE_SERVICE_UUID,
      GLUCOSE_MEASUREMENT_UUID,
      (error, characteristic) => {
        if (settled || error || !characteristic?.value) return;
        const reading = parseGlucoseMeasurement(toByteArray(characteristic.value));
        if (reading) collected.push(reading);
      },
    );

    racpSub = device.monitorCharacteristicForService(
      GLUCOSE_SERVICE_UUID,
      RECORD_ACCESS_CONTROL_POINT_UUID,
      (error, characteristic) => {
        if (settled) return;
        if (error) {
          finish(() => reject(error));
          return;
        }
        if (!characteristic?.value) return;
        const response = parseRacpResponse(toByteArray(characteristic.value));
        if (
          response.responseCode === RacpResponseCode.Success ||
          response.responseCode === RacpResponseCode.NoRecordsFound
        ) {
          finish(() => resolve(collected));
        } else {
          finish(() => reject(new Error(`Meter reported: ${describeRacpResponseCode(response.responseCode)}`)));
        }
      },
    );

    device
      .writeCharacteristicWithResponseForService(
        GLUCOSE_SERVICE_UUID,
        RECORD_ACCESS_CONTROL_POINT_UUID,
        fromByteArray(buildReportAllRecordsCommand()),
      )
      .catch((error) => finish(() => reject(error)));
  });
}
