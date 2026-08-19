// Orchestrates a HealthKit/Health Connect sync: pulls steps/activity/
// nutrition since the last sync (or a bounded first-run lookback),
// persists via lib/db/health.ts, and advances Settings.healthLastSyncedAt.
// Shared by the background task (lib/tasks/healthSyncTask.ts) and the
// manual paths (Settings > "Sync now", Logbook pull-to-refresh) — same
// "one function, every caller" reasoning as lib/tasks/insightTask.ts's
// runInsightGeneration.
//
// `healthAdapter` resolves to exactly one of adapter.ios.ts/
// adapter.android.ts/adapter.ts via Metro's platform-extension file
// resolution, not a Platform.OS branch at call time — see adapter.ios.ts's
// comment for why that distinction matters (a prior version imported both
// platform adapters unconditionally and crashed on Android evaluating
// HealthKit-only constants at module scope).
import { Platform } from 'react-native';
import { insertHealthActivities, insertHealthNutrition, insertHealthSteps, type HealthSource } from '../db/health';
import { readSettings, writeSettings } from '../settings';
import { healthAdapter } from './adapter';

// 7 days — enough to backfill recent activity/nutrition rows and a
// week of Insights-payload step data without pulling a new user's entire
// HealthKit/Health Connect history on first sync (which could be years
// of steps data).
const FIRST_SYNC_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export function isHealthSyncSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export async function requestHealthPermissions(): Promise<boolean> {
  if (!isHealthSyncSupported()) return false;
  if (!(await healthAdapter.isAvailable())) return false;
  return healthAdapter.requestPermissions();
}

export interface HealthSyncResult {
  steps: number;
  activities: number;
  nutrition: number;
}

export async function syncHealthData(): Promise<HealthSyncResult> {
  if (!isHealthSyncSupported()) return { steps: 0, activities: 0, nutrition: 0 };

  const settings = await readSettings();
  const sinceMs = settings.healthLastSyncedAt
    ? new Date(settings.healthLastSyncedAt).getTime()
    : Date.now() - FIRST_SYNC_LOOKBACK_MS;

  const source: HealthSource = Platform.OS === 'ios' ? 'healthkit' : 'healthconnect';
  const [steps, activities, nutrition] = await Promise.all([
    healthAdapter.readSteps(sinceMs),
    healthAdapter.readActivities(sinceMs),
    healthAdapter.readNutrition(sinceMs),
  ]);

  await Promise.all([
    insertHealthSteps(source, steps),
    insertHealthActivities(source, activities),
    insertHealthNutrition(source, nutrition),
  ]);

  await writeSettings({ ...settings, healthLastSyncedAt: new Date().toISOString() });

  return { steps: steps.length, activities: activities.length, nutrition: nutrition.length };
}
