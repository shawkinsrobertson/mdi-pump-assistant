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

// `forceFullResync`: re-fetches the full FIRST_SYNC_LOOKBACK_MS window
// regardless of nightscoutLastSyncedAt, rather than only the incremental
// "since last sync" window. Exists for Settings > Integrations' "Resync
// full history" action (IntegrationsScreen.tsx) — once
// nightscoutLastSyncedAt has advanced, an ordinary sync only ever looks
// forward from it, so a device that already ran a sync before
// fetchNightscoutTreatments' pagination fix (which could silently drop
// everything past the newest `count` matches) has no way to recover that
// gap on its own; every later "since last sync" call starts from a point
// that's already past it.
export async function syncNightscoutTreatments(forceFullResync = false): Promise<NightscoutSyncResult> {
  const settings = await readSettings();
  if (!isNightscoutConfigured(settings)) return { treatments: 0 };

  const sinceMs =
    settings.nightscoutLastSyncedAt && !forceFullResync
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
