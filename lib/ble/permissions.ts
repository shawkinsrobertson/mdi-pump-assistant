import { PermissionsAndroid, Platform } from 'react-native';

// Android 12+ (API 31+) uses BLUETOOTH_SCAN/BLUETOOTH_CONNECT and — since
// app.json declares neverForLocation — needs no location permission at all.
// Older Android still requires ACCESS_FINE_LOCATION to scan for BLE
// devices, even though this app never reads location data.
export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const apiLevel = Platform.Version as number;

  const permissions =
    apiLevel >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const results = await PermissionsAndroid.requestMultiple(permissions);
  return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}
