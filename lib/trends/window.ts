// Shared "which day range is selected" concept for the Trends screen's
// cards (Time in Range, Ambulatory Glucose Profile) — kept separate from
// each card's own computation so both use the same window semantics.

export type TrendsWindow = 'today' | 7 | 30 | 90;

export const TRENDS_WINDOWS: TrendsWindow[] = ['today', 7, 30, 90];

export function trendsWindowLabel(window: TrendsWindow): string {
  return window === 'today' ? 'Today' : `${window}`;
}

// "Today" is the current calendar day (since local midnight) — the other
// windows are rolling N*24h lookbacks, not calendar-aligned.
export function windowStartMs(window: TrendsWindow, now: Date): number {
  if (window === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }
  return now.getTime() - window * 24 * 60 * 60 * 1000;
}
