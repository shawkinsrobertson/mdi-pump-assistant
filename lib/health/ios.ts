// HealthKit adapter (react-native-health, MIT). Read-only: this app only
// ever requests `read` permissions, never `write` — see AGENTS.md for why
// (imported data is reference-only, never fed into COB/IOB).
//
// react-native-health's API is callback-based (predates the rest of this
// codebase's promise-based native modules); every function here just
// wraps one call in a Promise so lib/health/sync.ts can treat this
// adapter identically to the Android one.
import AppleHealthKit, {
  type HealthValue,
  type HKWorkoutQueriedSampleType,
  HealthPermission,
  HealthUnit,
} from 'react-native-health';
import type { HealthAdapter, RawActivitySample, RawNutritionSample, RawStepsSample } from './types';

const PERMISSIONS = {
  permissions: {
    read: [HealthPermission.StepCount, HealthPermission.Workout, HealthPermission.Carbohydrates],
    write: [],
  },
};

function isAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    AppleHealthKit.isAvailable((err, available) => resolve(!err && available));
  });
}

function requestPermissions(): Promise<boolean> {
  return new Promise((resolve) => {
    AppleHealthKit.initHealthKit(PERMISSIONS, (err) => resolve(!err));
  });
}

// HealthKit sample ids are stable per-sample, but getDailyStepCountSamples
// doesn't return one — it aggregates on the fly, so this app makes its
// own id from the bucket's own start/end instead of trusting the library
// for one. Harmless either way since it's only ever used as this row's
// half of the (source, external_id) dedup key.
function readSteps(sinceMs: number): Promise<RawStepsSample[]> {
  return new Promise((resolve, reject) => {
    AppleHealthKit.getDailyStepCountSamples(
      { startDate: new Date(sinceMs).toISOString(), includeManuallyAdded: true },
      (err: string, results: HealthValue[]) => {
        if (err) {
          reject(new Error(err));
          return;
        }
        resolve(
          (results ?? []).map((r) => ({
            externalId: r.id ?? `${r.startDate}-${r.endDate}`,
            count: Math.round(r.value),
            startTime: new Date(r.startDate).getTime(),
            endTime: new Date(r.endDate).getTime(),
          })),
        );
      },
    );
  });
}

function readActivities(sinceMs: number): Promise<RawActivitySample[]> {
  return new Promise((resolve, reject) => {
    AppleHealthKit.getAnchoredWorkouts(
      { startDate: new Date(sinceMs).toISOString() },
      (err, results) => {
        if (err) {
          reject(new Error(err.message ?? 'getAnchoredWorkouts failed'));
          return;
        }
        const data: HKWorkoutQueriedSampleType[] = results?.data ?? [];
        resolve(
          data.map((w) => ({
            externalId: w.id,
            title: w.activityName,
            durationMinutes: Number.isFinite(w.duration) ? w.duration / 60 : null,
            calories: Number.isFinite(w.calories) ? w.calories : null,
            startTime: new Date(w.start).getTime(),
            endTime: new Date(w.end).getTime(),
          })),
        );
      },
    );
  });
}

function readNutrition(sinceMs: number): Promise<RawNutritionSample[]> {
  return new Promise((resolve, reject) => {
    AppleHealthKit.getCarbohydratesSamples(
      { startDate: new Date(sinceMs).toISOString(), unit: HealthUnit.gram },
      (err: string, results: HealthValue[]) => {
        if (err) {
          reject(new Error(err));
          return;
        }
        resolve(
          (results ?? [])
            .filter((r) => r.id != null)
            .map((r) => ({
              externalId: r.id as string,
              carbsGrams: r.value,
              loggedAt: new Date(r.startDate).getTime(),
            })),
        );
      },
    );
  });
}

export const iosHealthAdapter: HealthAdapter = {
  isAvailable,
  requestPermissions,
  readSteps,
  readActivities,
  readNutrition,
};
