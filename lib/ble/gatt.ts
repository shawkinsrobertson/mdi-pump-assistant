// Bluetooth SIG standard Glucose Service (0x1808) — generic across compliant
// meters (Contour Next One, and any other GLS-profile device), not
// device-specific code per brand.
export const GLUCOSE_SERVICE_UUID = '00001808-0000-1000-8000-00805f9b34fb';
export const GLUCOSE_MEASUREMENT_UUID = '00002a18-0000-1000-8000-00805f9b34fb';
export const GLUCOSE_FEATURE_UUID = '00002a51-0000-1000-8000-00805f9b34fb';
export const RECORD_ACCESS_CONTROL_POINT_UUID = '00002a52-0000-1000-8000-00805f9b34fb';

// Client Characteristic Configuration Descriptor (0x2902) — the standard
// descriptor whose value enables/disables notifications or indications on
// a characteristic. Not glucose-specific; every notifying/indicating GATT
// characteristic has one.
export const CLIENT_CHARACTERISTIC_CONFIG_UUID = '00002902-0000-1000-8000-00805f9b34fb';

// Standard CCCD values (Bluetooth Core Spec, little-endian uint16):
// 0x0001 enables notifications, 0x0002 enables indications. Record
// Access Control Point (0x2A52) is indicate-only per the Glucose Service
// spec (Glucose Measurement, by contrast, is notify-only).
export const CCCD_ENABLE_INDICATIONS = new Uint8Array([0x02, 0x00]);
