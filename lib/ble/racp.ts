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

export function buildReportAllRecordsCommand(): Uint8Array {
  return new Uint8Array([RACP_OP_CODE.REPORT_STORED_RECORDS, RACP_OPERATOR.ALL_RECORDS]);
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
