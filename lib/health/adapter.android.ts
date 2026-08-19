// Health Connect adapter (react-native-health-connect, MIT). Read-only —
// same reasoning as adapter.ios.ts: only `read` permissions are ever
// requested.
//
// `.android.ts` (not a plain `.ts`) for the same reason adapter.ios.ts is
// `.ios.ts` — see that file's comment. This file's own module-level
// `buildExerciseTypeLabels(ExerciseType)` call below would hit the exact
// same class of bug on iOS that HealthPermission.StepCount hit on
// Android, if this were ever bundled into the iOS build.
import {
  ExerciseType,
  getGrantedPermissions,
  initialize,
  readRecords,
  requestPermission,
} from 'react-native-health-connect';
import { buildExerciseTypeLabels } from './exerciseTypeLabel';
import type { HealthAdapter, RawActivitySample, RawNutritionSample, RawStepsSample } from './types';

const REQUESTED_PERMISSIONS = [
  { accessType: 'read' as const, recordType: 'Steps' as const },
  { accessType: 'read' as const, recordType: 'ExerciseSession' as const },
  { accessType: 'read' as const, recordType: 'Nutrition' as const },
];

// See lib/health/exerciseTypeLabel.ts for why the humanizing logic itself
// lives there instead of inline here.
const EXERCISE_TYPE_LABELS = buildExerciseTypeLabels(ExerciseType);

function exerciseTypeLabel(type: number): string {
  return EXERCISE_TYPE_LABELS[type] ?? 'Activity';
}

async function isAvailable(): Promise<boolean> {
  try {
    return await initialize();
  } catch {
    return false;
  }
}

async function requestPermissions(): Promise<boolean> {
  const granted = await requestPermission(REQUESTED_PERMISSIONS);
  const grantedTypes = new Set(granted.map((p) => ('recordType' in p ? p.recordType : null)));
  return REQUESTED_PERMISSIONS.every((p) => grantedTypes.has(p.recordType));
}

// Best-effort: if permissions were revoked since the last check, readRecords
// below will simply throw and sync.ts treats that per-adapter call as a
// failed sync rather than crashing the whole app — see getGrantedPermissions
// use in requestPermissions() for the up-front check instead.
async function hasReadPermission(recordType: 'Steps' | 'ExerciseSession' | 'Nutrition'): Promise<boolean> {
  const granted = await getGrantedPermissions();
  return granted.some((p) => 'recordType' in p && p.recordType === recordType && p.accessType === 'read');
}

async function readSteps(sinceMs: number): Promise<RawStepsSample[]> {
  if (!(await hasReadPermission('Steps'))) return [];
  const { records } = await readRecords('Steps', {
    timeRangeFilter: { operator: 'after', startTime: new Date(sinceMs).toISOString() },
  });
  return records.map((r) => ({
    externalId: r.metadata?.id ?? `${r.startTime}-${r.endTime}`,
    count: r.count,
    startTime: new Date(r.startTime).getTime(),
    endTime: new Date(r.endTime).getTime(),
  }));
}

async function readActivities(sinceMs: number): Promise<RawActivitySample[]> {
  if (!(await hasReadPermission('ExerciseSession'))) return [];
  const { records } = await readRecords('ExerciseSession', {
    timeRangeFilter: { operator: 'after', startTime: new Date(sinceMs).toISOString() },
  });
  return records
    .filter((r) => r.metadata?.id != null)
    .map((r) => {
      const startTime = new Date(r.startTime).getTime();
      const endTime = new Date(r.endTime).getTime();
      return {
        externalId: r.metadata!.id as string,
        title: r.title?.trim() || exerciseTypeLabel(r.exerciseType),
        durationMinutes: (endTime - startTime) / 60_000,
        // Health Connect's ExerciseSession record carries no calorie
        // field of its own (unlike HealthKit's workout samples) — would
        // need a correlated ActiveCaloriesBurned query over the same
        // window, not built for this first pass.
        calories: null,
        startTime,
        endTime,
      };
    });
}

async function readNutrition(sinceMs: number): Promise<RawNutritionSample[]> {
  if (!(await hasReadPermission('Nutrition'))) return [];
  const { records } = await readRecords('Nutrition', {
    timeRangeFilter: { operator: 'after', startTime: new Date(sinceMs).toISOString() },
  });
  return records
    .filter((r) => r.metadata?.id != null && r.totalCarbohydrate != null)
    .map((r) => ({
      externalId: r.metadata!.id as string,
      carbsGrams: r.totalCarbohydrate!.inGrams,
      loggedAt: new Date(r.startTime).getTime(),
    }));
}

export const healthAdapter: HealthAdapter = {
  isAvailable,
  requestPermissions,
  readSteps,
  readActivities,
  readNutrition,
};
