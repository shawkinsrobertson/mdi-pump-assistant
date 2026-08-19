// Orchestrates a HealthKit/Health Connect sync: picks the platform
// adapter, pulls steps/activity/nutrition since the last sync (or a
// bounded first-run lookback), persists via lib/db/health.ts, and
// advances Settings.healthLastSyncedAt. Shared by the background task
// (lib/tasks/healthSyncTask.ts) and the manual paths (Settings > "Sync
// now", Logbook pull-to-refresh) — same "one function, every caller"
// reasoning as lib/tasks/insightTask.ts's runInsightGeneration.
import { Platform } from 'react-native';
import { insertHealthActivities, insertHealthNutrition, insertHealthSteps } from '../db/health';
import { readSettings, writeSettings } from '../settings';
import { androidHealthAdapter } from './android';
import { iosHealthAdapter } from './ios';
import type { HealthAdapter } from './types';

// 7 days — enough to backfill a Trends steps card and recent activity/
// nutrition rows without pulling a new user's entire HealthKit/Health
// Connect history on first sync (which could be years of steps data).
const FIRST_SYNC_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function getAdapter(): HealthAdapter | null {
  if (Platform.OS === 'ios') return iosHealthAdapter;
  if (Platform.OS === 'android') return androidHealthAdapter;
  return null; // web preview, etc. — no native health module to call
}

export function isHealthSyncSupported(): boolean {
  return getAdapter() !== null;
}

export async function requestHealthPermissions(): Promise<boolean> {
  const adapter = getAdapter();
  if (!adapter) return false;
  if (!(await adapter.isAvailable())) return false;
  return adapter.requestPermissions();
}

export interface HealthSyncResult {
  steps: number;
  activities: number;
  nutrition: number;
}

export async function syncHealthData(): Promise<HealthSyncResult> {
  const adapter = getAdapter();
  if (!adapter) return { steps: 0, activities: 0, nutrition: 0 };

  const settings = await readSettings();
  const sinceMs = settings.healthLastSyncedAt
    ? new Date(settings.healthLastSyncedAt).getTime()
    : Date.now() - FIRST_SYNC_LOOKBACK_MS;

  const source = Platform.OS === 'ios' ? 'healthkit' : 'healthconnect';
  const [steps, activities, nutrition] = await Promise.all([
    adapter.readSteps(sinceMs),
    adapter.readActivities(sinceMs),
    adapter.readNutrition(sinceMs),
  ]);

  await Promise.all([
    insertHealthSteps(source, steps),
    insertHealthActivities(source, activities),
    insertHealthNutrition(source, nutrition),
  ]);

  await writeSettings({ ...settings, healthLastSyncedAt: new Date().toISOString() });

  return { steps: steps.length, activities: activities.length, nutrition: nutrition.length };
}
