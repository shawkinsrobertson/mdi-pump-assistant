// Shape both platform adapters (ios.ts / android.ts) normalize their
// native SDK's results into, before lib/db/health.ts persists them.
// externalId is whatever stable identifier the platform SDK gives a
// record — HealthKit's sample id, Health Connect's metadata.id — used as
// the dedup key alongside the source, same approach as
// lib/db/glucoseReadings.ts.

export interface RawStepsSample {
  externalId: string;
  count: number;
  startTime: number; // epoch ms
  endTime: number;
}

export interface RawActivitySample {
  externalId: string;
  title: string;
  durationMinutes: number | null;
  calories: number | null;
  startTime: number;
  endTime: number;
}

export interface RawNutritionSample {
  externalId: string;
  carbsGrams: number;
  loggedAt: number;
}

// One platform adapter (lib/health/ios.ts, lib/health/android.ts)
// implements this against its native SDK; lib/health/sync.ts picks
// whichever matches Platform.OS and doesn't otherwise care which.
export interface HealthAdapter {
  isAvailable(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  readSteps(sinceMs: number): Promise<RawStepsSample[]>;
  readActivities(sinceMs: number): Promise<RawActivitySample[]>;
  readNutrition(sinceMs: number): Promise<RawNutritionSample[]>;
}
