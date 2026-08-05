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

// Status colors now come from the resolved theme (ThemeColors.status),
// not a fixed palette — a status color tuned for a white background
// isn't automatically legible against a near-black one (see lib/theme.ts's
// light/dark contrast audit). bgColor takes the theme's status colors
// directly rather than a full ThemeColors to keep this glucose-domain
// module decoupled from the app's theme module shape.
export interface BgStatusColors {
  status: { success: string; warning: string; danger: string };
}

export function bgColor(sgv: number, colors: BgStatusColors): string {
  if (sgv >= 70 && sgv <= 180) return colors.status.success;
  if ((sgv >= 55 && sgv < 70) || (sgv > 180 && sgv <= 250)) return colors.status.warning;
  return colors.status.danger;
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

// "2min ago" / "just now" — the status timestamp shown right-aligned
// above the chart.
export function formatMinutesAgo(epochMs: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - epochMs) / 60_000));
  if (minutes === 0) return 'just now';
  return `${minutes}min ago`;
}

// "+2" / "-3" / "0" — reading-to-reading delta shown next to the trend
// arrow. xDrip+'s sgv.json already supplies a real delta per reading
// (GlucoseReading.delta); this only formats it.
export function formatDelta(delta: number): string {
  const rounded = Math.round(delta);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}
