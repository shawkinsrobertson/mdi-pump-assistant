const { basalDisplayName } = require('../basalReminders');

describe('basalDisplayName', () => {
  it('uses the type name for a known insulin', () => {
    expect(basalDisplayName({ type: 'glargine', customName: null, customDurationHours: null, units: 20, times: [] })).toBe(
      'glargine',
    );
  });

  it("uses the custom name for 'other', trimmed", () => {
    expect(
      basalDisplayName({ type: 'other', customName: '  Toujeo  ', customDurationHours: 30, units: 20, times: [] }),
    ).toBe('Toujeo');
  });

  it("falls back to 'basal' when 'other' has no custom name set", () => {
    expect(basalDisplayName({ type: 'other', customName: null, customDurationHours: 30, units: 20, times: [] })).toBe(
      'basal',
    );
  });
});
