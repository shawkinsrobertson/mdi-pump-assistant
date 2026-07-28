const { windowStartMs, trendsWindowLabel, TRENDS_WINDOWS } = require('../window');

describe('windowStartMs', () => {
  it('"today" starts at local midnight, not a rolling 24h', () => {
    const now = new Date('2026-07-28T15:30:00');
    const start = windowStartMs('today', now);
    const startDate = new Date(start);
    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(startDate.getSeconds()).toBe(0);
    expect(startDate.getDate()).toBe(now.getDate());
  });

  it('7/30/90 are rolling N*24h windows ending now', () => {
    const now = new Date('2026-07-28T15:30:00');
    for (const days of [7, 30, 90]) {
      const start = windowStartMs(days, now);
      expect(now.getTime() - start).toBe(days * 24 * 60 * 60 * 1000);
    }
  });
});

describe('trendsWindowLabel', () => {
  it('labels "today" specially and others by day count', () => {
    expect(trendsWindowLabel('today')).toBe('Today');
    expect(trendsWindowLabel(7)).toBe('7');
    expect(trendsWindowLabel(90)).toBe('90');
  });
});

describe('TRENDS_WINDOWS', () => {
  it('lists today, 7, 30, 90 in that order', () => {
    expect(TRENDS_WINDOWS).toEqual(['today', 7, 30, 90]);
  });
});
