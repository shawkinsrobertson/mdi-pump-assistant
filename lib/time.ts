import type { TimeFormat } from './ThemeContext';

// Formats a clock time honoring the user's 12h/24h Display preference.
// Not yet wired into Dashboard/Logbook's own time displays (they still
// use their original formatting) — follow-up work, see AGENTS.md.
export function formatTime(date: Date, format: TimeFormat): string {
  if (format === '24h') {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
