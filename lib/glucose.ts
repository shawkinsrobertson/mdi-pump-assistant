// Matches the sgv.json reading object emitted by xDrip+'s local web server
// (Nightscout-compatible; the same shape Juggluco emits, so this also works
// as a drop-in fallback source without code changes).
export interface GlucoseReading {
  sgv: number;
  date: number; // epoch ms — the only reliable staleness signal
  dateString: string;
  delta: number;
  direction: string;
  noise: number;
  _id: string;
}

export const COLORS = {
  in: '#16a34a',
  warn: '#d97706',
  danger: '#dc2626',
  bandIn: 'rgba(22, 163, 74, 0.12)',
  bandWarn: 'rgba(217, 119, 6, 0.12)',
  grid: '#d1d5db',
  muted: '#6b7280',
  foreground: '#111827',
};

export function bgColor(sgv: number): string {
  if (sgv >= 70 && sgv <= 180) return COLORS.in;
  if ((sgv >= 55 && sgv < 70) || (sgv > 180 && sgv <= 250)) return COLORS.warn;
  return COLORS.danger;
}

const TREND_ARROWS: Record<string, string> = {
  None: '—',
  DoubleUp: '⇈',
  SingleUp: '↑',
  FortyFiveUp: '↗',
  Flat: '→',
  FortyFiveDown: '↘',
  SingleDown: '↓',
  DoubleDown: '⇊',
  'NOT COMPUTABLE': '—',
  'RATE OUT OF RANGE': '⇕',
};

// xDrip+ normally emits the standard Nightscout enum above, but Juggluco
// (a drop-in source against the same endpoint, per AGENTS.md) emits
// freeform strings like "raised 10" / "falling 5" instead — handle both
// rather than assuming one format.
export function arrowForDirection(direction: string): string {
  const known = TREND_ARROWS[direction];
  if (known) return known;
  const d = direction.toLowerCase();
  if (d.includes('flat')) return '→';
  if (d.includes('raised') || d.includes('rising') || d.includes('up')) return '↑';
  if (d.includes('falling') || d.includes('dropping') || d.includes('down')) return '↓';
  return '—';
}

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // matches the "good reading" staleness window in AGENTS.md §6

export function isStale(reading: GlucoseReading): boolean {
  return Date.now() - reading.date > STALE_THRESHOLD_MS;
}

export function formatClockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}
