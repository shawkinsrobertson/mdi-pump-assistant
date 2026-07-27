import { BleError, BleATTErrorCode, BleAndroidErrorCode, BleErrorCode } from 'react-native-ble-plx';

// Removing a monitor subscription (device.remove()) internally cancels
// its transaction, which delivers this exact error code back to that
// same subscription's error callback — an expected side effect of
// intentionally tearing it down, not a real failure. Callers that keep
// a long-lived subscription and remove it on disconnect/cleanup should
// skip surfacing this one to the user.
export function isOperationCancelledError(error: unknown): boolean {
  return error instanceof BleError && error.errorCode === BleErrorCode.OperationCancelled;
}

// react-native-ble-plx's BleError carries the actual GATT-level reason
// (attErrorCode/androidErrorCode) behind fields like .message, which is
// often just a generic "write failed" template — surface the real reason
// so failures are diagnosable instead of guessed at.
export function describeBleError(error: unknown): string {
  if (!(error instanceof BleError)) {
    return error instanceof Error ? error.message : String(error);
  }

  const parts = [error.message];

  if (error.attErrorCode === BleATTErrorCode.InsufficientAuthentication) {
    parts.push(
      'The device requires a paired (bonded) connection for this operation. ' +
        'Check for an Android Bluetooth pairing prompt and confirm it, then try again.',
    );
  } else if (error.attErrorCode === BleATTErrorCode.InsufficientEncryption) {
    parts.push(
      'The device requires an encrypted connection for this operation — ' +
        'same fix as a bonding prompt: pair the device in Android, then try again.',
    );
  } else if (error.attErrorCode != null) {
    parts.push(`ATT error code: ${error.attErrorCode}`);
  }

  if (error.androidErrorCode != null) {
    parts.push(`Android error code: ${error.androidErrorCode}`);
    if (error.androidErrorCode === BleAndroidErrorCode.InternalError) {
      // Documented by the library only as "may happen due to implementation
      // error in BLE stack" — genuinely ambiguous. In practice this has been
      // seen for bonding-required writes on some Android/vendor BLE stacks
      // (reported as this generic code instead of a specific auth ATT
      // error), but it's not certain — hedge accordingly.
      parts.push(
        'This is a generic Android BLE stack error — one known cause is the device requiring ' +
          "a bonded (paired) connection. If it wasn't already paired, try pairing it manually " +
          'via Android Settings > Bluetooth first, then reconnect here and try again.',
      );
    }
  }
  if (error.reason) parts.push(`Reason: ${error.reason}`);

  return parts.join(' ');
}
