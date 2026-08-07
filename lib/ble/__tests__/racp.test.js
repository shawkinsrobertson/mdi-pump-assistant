const { buildFetchAllRecordsCommand, describeRacpResponseCode, parseRacpResponse, RacpResponseCode } = require('../racp');

describe('buildFetchAllRecordsCommand', () => {
  it('builds "report records >= sequence 0" (opcode 1, operator 3, filter type 1, sequence 0x0000 LE), not "all records" (operator 1)', () => {
    // Regression test for the Contour Next One connection-drop bug:
    // RACP opcode 1 + operator 1 ("All records") made that meter terminate
    // the connection outright (GATT_CONN_TERMINATE_PEER_USER) instead of
    // responding normally, surfacing as a generic Android
    // GATT_INTERNAL_ERROR (129) on the write. Confirmed via xDrip+'s
    // source (GPL-3.0, studied for the command shape only) special-casing
    // Ascensia/Contour meters to always use operator 3 with a
    // sequence-number filter instead — see racp.ts's own comment.
    expect(Array.from(buildFetchAllRecordsCommand())).toEqual([1, 3, 1, 0, 0]);
  });
});

describe('parseRacpResponse', () => {
  it('parses a standard RACP response (opcode 6) into its response code', () => {
    const bytes = new Uint8Array([6, 0, 1, RacpResponseCode.Success]);
    expect(parseRacpResponse(bytes)).toEqual({
      opCode: 6,
      requestOpCode: 1,
      responseCode: RacpResponseCode.Success,
    });
  });

  it('returns a null responseCode for anything that is not a response-code opcode', () => {
    const bytes = new Uint8Array([1, 1]);
    expect(parseRacpResponse(bytes)).toEqual({ opCode: 1, requestOpCode: null, responseCode: null });
  });

  it('returns a null responseCode when the response is too short to contain one', () => {
    const bytes = new Uint8Array([6, 0]);
    expect(parseRacpResponse(bytes)).toEqual({ opCode: 6, requestOpCode: null, responseCode: null });
  });
});

describe('describeRacpResponseCode', () => {
  it('names a known response code', () => {
    expect(describeRacpResponseCode(RacpResponseCode.NoRecordsFound)).toBe('NoRecordsFound');
  });

  it('flags an unrecognized response', () => {
    expect(describeRacpResponseCode(null)).toBe('Unrecognized RACP response');
  });
});
