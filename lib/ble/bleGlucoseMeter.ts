import { fromByteArray, toByteArray } from 'base64-js';
import { BleManager, type Device, type State } from 'react-native-ble-plx';
import { describeBleError, isOperationCancelledError } from './errors';
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// TEMPORARY diagnostic logging for the RACP GATT_INTERNAL_ERROR (129)
// investigation (see AGENTS.md's Bluetooth section) — remove once the
// root cause is confirmed and fixed. `[BLE DIAG]` prefix makes these easy
// to find (and later strip) in `adb logcat` / Metro output, and easy to
// tell apart from describeBleError()'s user-facing message in
// BleMeterModal. Logs elapsed-ms-since-sync-start so the timing between
// steps (not just pass/fail) is visible — useful for telling "failed
// instantly" apart from "stalled, then failed."
function diag(label: string, startedAt: number, extra?: unknown) {
  const elapsed = Date.now() - startedAt;
  if (extra !== undefined) {
    console.log(`[BLE DIAG] +${elapsed}ms ${label}`, extra);
  } else {
    console.log(`[BLE DIAG] +${elapsed}ms ${label}`);
  }
}

// BluetoothGatt.refresh() (what refreshGatt: 'OnConnected' triggers below)
// is fire-and-forget on Android — there is no callback for when the cache
// clear actually finishes. Calling discoverAllServicesAndCharacteristics()
// immediately afterward with zero delay risks discovering against a GATT
// layer that's still mid-refresh, leaving stale/half-populated
// characteristic references that a later write can be sent against
// without ever getting a response — which surfaces not as an immediate
// error but as a stall until Android's own ~30s ATT timeout kills the
// connection outright (GATT_CONN_TERMINATE_LOCAL_HOST), a strictly worse
// symptom than the GATT_INTERNAL_ERROR this was meant to fix. A short
// settle delay between the two calls is the standard mitigation for this
// specific refresh()-has-no-completion-signal gap. 300ms is a starting
// guess, not a spec'd value — adjust if this still races on-device.
const GATT_REFRESH_SETTLE_DELAY_MS = 300;

// refreshGatt: 'OnConnected' calls Android's BluetoothGatt.refresh() (a
// hidden API react-native-ble-plx wraps internally — no native module
// needed) right after connecting, forcing a clean re-read of the
// device's service/characteristic table instead of trusting Android's
// cached copy. Added specifically to test the stale-GATT-cache theory
// for the persistent GATT_INTERNAL_ERROR (129) on RACP writes — see
// AGENTS.md's Bluetooth section: two rounds of operation-ordering fixes
// (a bond-retry delay, then a CCCD-read barrier) were verified on-device
// to NOT resolve it, which points away from a timing/ordering root cause
// and toward something like a stale cache surviving a re-pair. Android
// only; a no-op on iOS (the settle delay below is harmless there either
// way).
export async function connectToMeter(deviceId: string): Promise<Device> {
  const t0 = Date.now();
  diag('connectToDevice() starting (refreshGatt: OnConnected)', t0);
  const device = await getManager().connectToDevice(deviceId, { refreshGatt: 'OnConnected' });
  diag('connectToDevice() resolved', t0);
  await delay(GATT_REFRESH_SETTLE_DELAY_MS);
  diag(`settle delay (${GATT_REFRESH_SETTLE_DELAY_MS}ms) elapsed, starting discovery`, t0);
  await device.discoverAllServicesAndCharacteristics();
  diag('discoverAllServicesAndCharacteristics() resolved', t0);
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

// Runs a GATT operation (read or write), retrying once after
// BOND_RETRY_DELAY_MS on failure — the standard workaround above,
// factored out since the CCCD read and the RACP command write below both
// need it.
//
// `label`/`t0` are diagnostic-only (see the `diag` comment above): the
// previous version of this function always re-threw `firstError` when
// both attempts failed, which meant the error message shown in the UI
// could never actually tell us whether the retry attempt did anything —
// same failure, a different failure, or literally never ran. Logging
// both attempts' outcomes (not just the final thrown error) directly
// answers that.
async function withBondRetry<T>(op: () => Promise<T>, label: string, t0: number): Promise<T> {
  try {
    const result = await op();
    diag(`${label}: first attempt succeeded`, t0);
    return result;
  } catch (firstError) {
    diag(`${label}: first attempt FAILED`, t0, describeBleError(firstError));
    await delay(BOND_RETRY_DELAY_MS);
    diag(`${label}: retrying after ${BOND_RETRY_DELAY_MS}ms delay`, t0);
    try {
      const result = await op();
      diag(`${label}: retry attempt SUCCEEDED (first attempt's error was transient)`, t0);
      return result;
    } catch (retryError) {
      diag(`${label}: retry attempt also FAILED`, t0, describeBleError(retryError));
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
  const t0 = Date.now();
  diag('fetchStoredRecords() starting', t0);
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
      diag('RACP_TIMEOUT_MS elapsed with no indication from the meter', t0);
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
              diag('RACP indication subscription errored', t0, describeBleError(error));
              finish(() => reject(error));
              return;
            }
            if (!characteristic?.value) return;
            const response = parseRacpResponse(toByteArray(characteristic.value));
            diag('RACP indication received', t0, describeRacpResponseCode(response.responseCode));
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
        diag('RACP monitorCharacteristicForService (indication) subscribed', t0);

        // 2. Read the CCCD back and wait for it — a barrier that can only
        // resolve after the monitor's own enable write has completed on
        // this connection's single-operation GATT queue. The value itself
        // is just a diagnostic (logged, not enforced) in case this still
        // doesn't resolve the underlying issue.
        //
        // Note this read is very likely NOT itself encryption-protected —
        // CCCD is a plain notify/indicate toggle per spec, unlike RACP's
        // own characteristic value — so it succeeding only confirms the
        // connection is alive, not that the encrypted/authenticated link
        // RACP's write needs has actually been established. Logged
        // separately from the write's own outcome below so the two can be
        // told apart.
        const cccd = await withBondRetry(
          () => device.readDescriptorForService(GLUCOSE_SERVICE_UUID, RECORD_ACCESS_CONTROL_POINT_UUID, CLIENT_CHARACTERISTIC_CONFIG_UUID),
          'RACP CCCD read',
          t0,
        );
        if (settled) return;
        const cccdBytes = cccd.value ? Array.from(toByteArray(cccd.value)) : cccd.value;
        diag('RACP CCCD read back', t0, cccdBytes);
        if (cccd.value == null || toByteArray(cccd.value).join(',') !== CCCD_ENABLE_INDICATIONS.join(',')) {
          console.error('RACP CCCD read back unexpected value after enabling indications:', cccdBytes);
        }

        // 3. Only now write the actual command — the read above confirms
        // the enable write already completed, so this can't race it.
        diag('writing RACP report-all-records command', t0);
        await withBondRetry(
          () =>
            device.writeCharacteristicWithResponseForService(
              GLUCOSE_SERVICE_UUID,
              RECORD_ACCESS_CONTROL_POINT_UUID,
              fromByteArray(buildReportAllRecordsCommand()),
            ),
          'RACP command write',
          t0,
        );
        diag('RACP command write acknowledged (write-with-response completed) — awaiting indication', t0);
      } catch (error) {
        diag('fetchStoredRecords() failed', t0, describeBleError(error));
        finish(() => reject(error as Error));
      }
    })();
  });
}
