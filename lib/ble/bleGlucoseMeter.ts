import { fromByteArray, toByteArray } from 'base64-js';
import { BleManager, type Device, type State } from 'react-native-ble-plx';
import { isOperationCancelledError } from './errors';
import {
  CCCD_ENABLE_INDICATIONS,
  CLIENT_CHARACTERISTIC_CONFIG_UUID,
  GLUCOSE_MEASUREMENT_UUID,
  GLUCOSE_SERVICE_UUID,
  RECORD_ACCESS_CONTROL_POINT_UUID,
} from './gatt';
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

// refreshGatt: 'OnConnected' calls Android's BluetoothGatt.refresh() (a
// hidden API react-native-ble-plx wraps internally — no native module
// needed) right after connecting, forcing a clean re-read of the
// device's service/characteristic table instead of trusting Android's
// cached copy. Added specifically to test the stale-GATT-cache theory
// for the persistent GATT_INTERNAL_ERROR (129) on RACP writes — see
// AGENTS.md's Bluetooth section: two rounds of operation-ordering fixes
// (a bond-retry delay, then a CCCD-read barrier) were verified on-device
// to NOT resolve it, which points away from a timing/ordering root cause
// and toward something like a stale cache surviving a re-pair. Unverified
// until tested on-device (Android only; a no-op on iOS).
export async function connectToMeter(deviceId: string): Promise<Device> {
  const device = await getManager().connectToDevice(deviceId, { refreshGatt: 'OnConnected' });
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

// react-native-ble-plx exposes no bonding API at all. When a write fails
// because the characteristic needs a bonded/encrypted link, Android's own
// stack is supposed to auto-trigger bonding and retry the operation
// internally — but the JS promise here has already rejected by the time
// that finishes, so the library never sees the eventual success. Waiting
// and retrying once from JS is the standard workaround for this in the
// react-native-ble-plx ecosystem.
const BOND_RETRY_DELAY_MS = 2_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs a GATT operation (read or write), retrying once after
// BOND_RETRY_DELAY_MS on failure — the standard workaround above,
// factored out since the CCCD read and the RACP command write below both
// need it.
async function withBondRetry<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (firstError) {
    await delay(BOND_RETRY_DELAY_MS);
    try {
      return await op();
    } catch {
      throw firstError;
    }
  }
}

// Triggers Record Access Control Point "Report Stored Records" / "All
// records". Resolves once the meter indicates completion (or rejects on
// error/timeout) — it does NOT collect the records itself. The matching
// Glucose Measurement notifications arrive over the same characteristic
// monitorLiveReadings is already subscribed to; the caller is expected to
// route readings into a temporary buffer while this promise is pending
// rather than have this function open a second, competing subscription.
//
// Sequencing here matters: xDrip+'s BLE handling (researched for this —
// GPL-3.0, so studied for approach only, no code copied) uses a strict
// single-GATT-operation-at-a-time queue, and specifically waits for the
// RACP characteristic's CCCD (notification/indication-enable descriptor)
// write to actually complete before ever writing the RACP command opcode.
//
// An earlier version of this function tried to replicate that by calling
// writeDescriptorForService on RACP's CCCD directly — but react-native-ble-plx
// unconditionally rejects any write to a CCCD (error 506,
// DescriptorWriteNotAllowed: "not allowed by iOS and therefore forbidden
// on Android as well"), since enabling notifications/indications is only
// ever done through monitorCharacteristicForService's own internal
// (permitted) mechanism — there is no way to trigger or await that enable
// write directly. Reading the CCCD is not similarly restricted, though,
// and Android's BLE stack only ever runs one GATT operation at a time per
// connection — so issuing a read for the same descriptor right after
// starting the monitor, and awaiting it, gives the same real completion
// signal: our read cannot complete before the monitor's own enable write
// (queued first) has already finished. This replaces the previous blind
// fixed delay (a guess, not a confirmation) with an actual barrier.
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
      try {
        // 1. Attach the listener. RACP is indicate-only (unlike Glucose
        // Measurement, which is notify-only) per the Glucose Service spec —
        // explicit here rather than left to the library's property-based
        // auto-detection. This enqueues the (permitted, internal) CCCD
        // enable write on the connection.
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
          undefined,
          'indication',
        );

        // 2. Read the CCCD back and wait for it — a barrier that can only
        // resolve after the monitor's own enable write has completed on
        // this connection's single-operation GATT queue. The value itself
        // is just a diagnostic (logged, not enforced) in case this still
        // doesn't resolve the underlying issue.
        const cccd = await withBondRetry(() =>
          device.readDescriptorForService(GLUCOSE_SERVICE_UUID, RECORD_ACCESS_CONTROL_POINT_UUID, CLIENT_CHARACTERISTIC_CONFIG_UUID),
        );
        if (settled) return;
        if (cccd.value == null || toByteArray(cccd.value).join(',') !== CCCD_ENABLE_INDICATIONS.join(',')) {
          console.error(
            'RACP CCCD read back unexpected value after enabling indications:',
            cccd.value ? Array.from(toByteArray(cccd.value)) : cccd.value,
          );
        }

        // 3. Only now write the actual command — the read above confirms
        // the enable write already completed, so this can't race it.
        await withBondRetry(() =>
          device.writeCharacteristicWithResponseForService(
            GLUCOSE_SERVICE_UUID,
            RECORD_ACCESS_CONTROL_POINT_UUID,
            fromByteArray(buildReportAllRecordsCommand()),
          ),
        );
      } catch (error) {
        finish(() => reject(error as Error));
      }
    })();
  });
}
