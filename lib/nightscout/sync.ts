// Orchestrates a Nightscout treatments sync: pulls everything since the
// last sync (or a bounded first-run lookback), persists via
// lib/db/nightscoutTreatments.ts, and advances
// Settings.nightscoutLastSyncedAt. Shared by the background task
// (lib/tasks/nightscoutSyncTask.ts) and the manual paths (Settings "Sync
// now", Logbook pull-to-refresh) — same "one function, every caller"
// reasoning as lib/health/sync.ts's syncHealthData.
//
// Glucose entries are handled separately (lib/GlucoseContext.tsx polls
// them live, same cadence as xDrip+) — this module is treatments only.
import { fetchNightscoutTreatments } from './client';
import { insertNightscoutTreatments } from '../db/nightscoutTreatments';
import { readSettings, writeSettings, type Settings } from '../settings';

// 7 days — same reasoning as lib/health/sync.ts's FIRST_SYNC_LOOKBACK_MS:
// enough to backfill recent Logbook rows without pulling someone's entire
// Nightscout treatment history on first sync.
const FIRST_SYNC_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export function isNightscoutConfigured(settings: Settings): boolean {
  return !!(settings.nightscoutUrl && settings.nightscoutToken);
}

export interface NightscoutSyncResult {
  treatments: number;
}

export async function syncNightscoutTreatments(): Promise<NightscoutSyncResult> {
  const settings = await readSettings();
  if (!isNightscoutConfigured(settings)) return { treatments: 0 };

  const sinceMs = settings.nightscoutLastSyncedAt
    ? new Date(settings.nightscoutLastSyncedAt).getTime()
    : Date.now() - FIRST_SYNC_LOOKBACK_MS;

  const treatments = await fetchNightscoutTreatments(
    settings.nightscoutUrl!,
    settings.nightscoutToken!,
    new Date(sinceMs).toISOString(),
  );
  await insertNightscoutTreatments(treatments);
  await writeSettings({ ...settings, nightscoutLastSyncedAt: new Date().toISOString() });

  return { treatments: treatments.length };
}
