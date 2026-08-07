// Record Access Control Point (0x2A52) — the standard protocol for
// retrieving glucose records the meter stored while disconnected. We only
// need the "report all stored records" flow: write a command, the meter
// streams the matching records as Glucose Measurement notifications, then
// indicates completion (or an error) on this characteristic.

const RACP_OP_CODE = {
  REPORT_STORED_RECORDS: 1,
  RESPONSE_CODE: 6,
} as const;

const RACP_OPERATOR = {
  ALL_RECORDS: 1,
  GREATER_THAN_OR_EQUAL: 3,
} as const;

const RACP_FILTER_TYPE = {
  SEQUENCE_NUMBER: 1,
} as const;

export enum RacpResponseCode {
  Success = 1,
  OpCodeNotSupported = 2,
  InvalidOperator = 3,
  OperatorNotSupported = 4,
  InvalidOperand = 5,
  NoRecordsFound = 6,
  AbortUnsuccessful = 7,
  ProcedureNotCompleted = 8,
  OperandNotSupported = 9,
}

// Requests every stored record via RACP's "Report records >= sequence
// number" operator (3, with a sequence-number filter) rather than
// operator 1 ("All records") — passing sequence 0 gets everything, since
// this app doesn't track a per-device high-water-mark sequence number
// (no incremental sync; every "Sync history" call re-fetches the meter's
// full stored history).
//
// This isn't a workaround for a spec violation: both operators are
// mandatory for any Bluetooth SIG Glucose Service implementation, so this
// is choosing between two equally spec-compliant commands, not bypassing
// a requirement. It matters in practice because Ascensia/Contour meters
// (confirmed via xDrip+'s source, GPL-3.0 — studied for the RACP command
// shape only, not copied; see RecordsCmdTx.java's getNewerThanSequence()
// there) don't handle "All records" (opcode 1, operator 1) gracefully —
// on the Contour Next One this app is tested against, sending it made the
// meter terminate the connection outright (GATT_CONN_TERMINATE_PEER_USER)
// instead of returning a normal RACP response, which surfaced to this
// app as a generic Android GATT_INTERNAL_ERROR (129) on the write. xDrip+
// works around this with per-manufacturer branching; using the
// "greater than or equal" operator unconditionally avoids needing that
// while still being correct for any compliant meter.
export function buildFetchAllRecordsCommand(): Uint8Array {
  const SEQUENCE_NUMBER_FOR_FULL_SYNC = 0;
  return new Uint8Array([
    RACP_OP_CODE.REPORT_STORED_RECORDS,
    RACP_OPERATOR.GREATER_THAN_OR_EQUAL,
    RACP_FILTER_TYPE.SEQUENCE_NUMBER,
    SEQUENCE_NUMBER_FOR_FULL_SYNC & 0xff, // sequence number, little-endian uint16
    (SEQUENCE_NUMBER_FOR_FULL_SYNC >> 8) & 0xff,
  ]);
}

export interface RacpResponse {
  opCode: number;
  requestOpCode: number | null;
  responseCode: RacpResponseCode | null;
}

export function parseRacpResponse(bytes: Uint8Array): RacpResponse {
  const opCode = bytes[0];
  if (opCode !== RACP_OP_CODE.RESPONSE_CODE || bytes.length < 4) {
    return { opCode, requestOpCode: null, responseCode: null };
  }
  return {
    opCode,
    requestOpCode: bytes[2],
    responseCode: bytes[3] as RacpResponseCode,
  };
}

export function describeRacpResponseCode(code: RacpResponseCode | null): string {
  if (code === null) return 'Unrecognized RACP response';
  return RacpResponseCode[code] ?? `Unknown response code (${code})`;
}
