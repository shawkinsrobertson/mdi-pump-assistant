// Background (best-effort) sync of HealthKit/Health Connect data — same
// TaskManager/BackgroundFetch pattern as lib/tasks/insightTask.ts, and
// the same "OS treats the interval as a floor, not a promise" caveat
// applies here too. Only runs anything if the person has actually opted
// in (Settings > Integrations > Health sync) — see lib/health/sync.ts for
// why this is opt-in and read-only.
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { syncHealthData } from '../health/sync';
import { readSettings } from '../settings';

export const HEALTH_SYNC_TASK = 'sync-health-data';

// Hourly floor — steps/activity/nutrition are much lower-stakes than the
// glucose data this app polls far more aggressively elsewhere, so there's
// no reason to fight the OS for tighter scheduling.
const HOURLY_SECONDS = 60 * 60;

// Must run unconditionally at module load — see insightTask.ts's
// identical comment for why (headless JS invocation).
TaskManager.defineTask(HEALTH_SYNC_TASK, async () => {
  try {
    const settings = await readSettings();
    if (!settings.healthSyncEnabled) return BackgroundFetch.BackgroundFetchResult.NoData;
    const result = await syncHealthData();
    const hasNewData = result.steps > 0 || result.activities > 0 || result.nutrition > 0;
    return hasNewData ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e) {
    console.error('Background health sync failed:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Called once from App.tsx on startup, same as registerInsightTask().
export async function registerHealthSyncTask(): Promise<void> {
  const already = await TaskManager.isTaskRegisteredAsync(HEALTH_SYNC_TASK);
  if (already) return;
  await BackgroundFetch.registerTaskAsync(HEALTH_SYNC_TASK, {
    minimumInterval: HOURLY_SECONDS,
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
