import { decodeSFLOAT } from './sfloat';
import type { GlucoseReading } from '../glucose';

// 1 mmol/L glucose ≈ 18.0182 mg/dL — the single conversion point for the
// Glucose Measurement characteristic's optional mol/L encoding (AGENTS.md:
// "single conversion layer", never mix units in storage).
const MGDL_PER_MMOL = 18.0182;

const SENSOR_FAULT_BITS: Array<[bit: number, description: string]> = [
  [0, 'Device battery low'],
  [1, 'Sensor malfunction'],
  [2, 'Sample size insufficient'],
  [3, 'Strip insertion error'],
  [4, 'Strip type incorrect for device'],
  [5, 'Sensor result higher than the device can process'],
  [6, 'Sensor result lower than the device can process'],
  [7, 'Sensor temperature too high for a valid result'],
  [8, 'Sensor temperature too low for a valid result'],
  [9, 'Strip pulled too soon / read interrupted'],
  [10, 'General device fault'],
  [11, "Time fault — device's clock is inaccurate"],
];

export interface BleGlucoseReading extends GlucoseReading {
  sequenceNumber: number;
  sensorFaults: string[];
}

// Parses the Glucose Measurement characteristic (0x2A18), format per the
// Bluetooth SIG Glucose Service spec: flags byte, sequence number, base
// time, optional time offset, optional concentration+type/location,
// optional sensor status. Standardized across compliant meters — no
// per-brand branching. Returns null for a record with no usable
// concentration (missing field, or a reserved/NaN SFLOAT value) rather
// than surfacing a fabricated number.
export function parseGlucoseMeasurement(bytes: Uint8Array): BleGlucoseReading | null {
  if (bytes.length < 10) return null; // flags + seq + base time is the minimum

  let offset = 0;
  const flags = bytes[offset];
  offset += 1;

  const timeOffsetPresent = (flags & 0x01) !== 0;
  const concentrationPresent = (flags & 0x02) !== 0;
  const isMmolL = (flags & 0x04) !== 0;
  const statusPresent = (flags & 0x08) !== 0;

  const sequenceNumber = bytes[offset] | (bytes[offset + 1] << 8);
  offset += 2;

  const year = bytes[offset] | (bytes[offset + 1] << 8);
  const month = bytes[offset + 2]; // 1–12
  const day = bytes[offset + 3];
  const hours = bytes[offset + 4];
  const minutes = bytes[offset + 5];
  const seconds = bytes[offset + 6];
  offset += 7;

  const date = new Date(year, month - 1, day, hours, minutes, seconds);

  if (timeOffsetPresent) {
    const raw = bytes[offset] | (bytes[offset + 1] << 8);
    const timeOffsetMinutes = raw >= 0x8000 ? raw - 0x10000 : raw;
    date.setMinutes(date.getMinutes() + timeOffsetMinutes);
    offset += 2;
  }

  if (!concentrationPresent) return null;

  const concentrationRaw = bytes[offset] | (bytes[offset + 1] << 8);
  offset += 2;
  offset += 1; // type/sample-location byte — not surfaced yet, see AGENTS.md "don't gold-plate"

  const decoded = decodeSFLOAT(concentrationRaw);
  if (decoded === null || !Number.isFinite(decoded)) return null;

  const sgv = isMmolL ? decoded * 1000 * MGDL_PER_MMOL : decoded * 100_000;

  const sensorFaults: string[] = [];
  if (statusPresent && offset + 1 < bytes.length) {
    const statusBits = bytes[offset] | (bytes[offset + 1] << 8);
    for (const [bit, description] of SENSOR_FAULT_BITS) {
      if (statusBits & (1 << bit)) sensorFaults.push(description);
    }
  }

  return {
    sgv: Math.round(sgv),
    date: date.getTime(),
    dateString: date.toISOString(),
    delta: 0,
    direction: 'None', // meters report a single point-in-time value, no trend
    noise: 1,
    _id: `ble-${sequenceNumber}`,
    sequenceNumber,
    sensorFaults,
  };
}
