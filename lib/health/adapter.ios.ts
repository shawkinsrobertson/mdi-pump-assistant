// HealthKit adapter (react-native-health, MIT). Read-only: this app only
// ever requests `read` permissions, never `write` — see AGENTS.md for why
// (imported data is reference-only, never fed into COB/IOB).
//
// `.ios.ts` (not a plain `.ts` picked by Platform.OS at call time) is
// deliberate: Metro only ever bundles this file into the iOS build, so
// it's the only way to guarantee react-native-health's native module is
// never touched — not even at module-evaluation time — on Android. A
// prior version imported both platforms' adapters unconditionally from
// sync.ts and branched on Platform.OS at call time; that still evaluated
// this file's top-level `HealthPermission.StepCount` reference inside the
// Android bundle, and `HealthPermission` comes back undefined there since
// react-native-health has no Android native module at all — crashing
// with "cannot read property 'StepCount' of undefined" on Android,
// confirmed on-device. See adapter.android.ts and adapter.ts (the web/
// unsupported-platform fallback) for the other two.
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

function isAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    AppleHealthKit.isAvailable((err, available) => resolve(!err && available));
  });
}

function requestPermissions(): Promise<boolean> {
  const permissions = {
    permissions: {
      read: [HealthPermission.StepCount, HealthPermission.Workout, HealthPermission.Carbohydrates],
      write: [],
    },
  };
  return new Promise((resolve) => {
    AppleHealthKit.initHealthKit(permissions, (err) => resolve(!err));
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

export const healthAdapter: HealthAdapter = {
  isAvailable,
  requestPermissions,
  readSteps,
  readActivities,
  readNutrition,
};
