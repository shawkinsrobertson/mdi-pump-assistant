// Background (best-effort) sync of Nightscout treatments — same
// TaskManager/BackgroundFetch pattern as lib/tasks/healthSyncTask.ts and
// lib/tasks/insightTask.ts, same "OS treats the interval as a floor, not
// a promise" caveat. Only runs anything if Nightscout is actually
// configured (Settings > Integrations) — see lib/nightscout/sync.ts's
// isNightscoutConfigured.
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { isNightscoutConfigured, syncNightscoutTreatments } from '../nightscout/sync';
import { readSettings } from '../settings';

export const NIGHTSCOUT_SYNC_TASK = 'sync-nightscout-treatments';

// Hourly floor — matches healthSyncTask.ts's cadence; treatments are
// sporadic events, not something that needs tighter polling than that.
const HOURLY_SECONDS = 60 * 60;

// Must run unconditionally at module load — see insightTask.ts's
// identical comment for why (headless JS invocation).
TaskManager.defineTask(NIGHTSCOUT_SYNC_TASK, async () => {
  try {
    const settings = await readSettings();
    if (!isNightscoutConfigured(settings)) return BackgroundFetch.BackgroundFetchResult.NoData;
    const result = await syncNightscoutTreatments();
    return result.treatments > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e) {
    console.error('Background Nightscout sync failed:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Called once from App.tsx on startup, same as registerInsightTask()/
// registerHealthSyncTask().
export async function registerNightscoutSyncTask(): Promise<void> {
  const already = await TaskManager.isTaskRegisteredAsync(NIGHTSCOUT_SYNC_TASK);
  if (already) return;
  await BackgroundFetch.registerTaskAsync(NIGHTSCOUT_SYNC_TASK, {
    minimumInterval: HOURLY_SECONDS,
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
