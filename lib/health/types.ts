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

// One platform adapter (lib/health/adapter.ios.ts, adapter.android.ts,
// adapter.ts for web/unsupported) implements this against its native
// SDK; Metro's platform-extension file resolution — not a Platform.OS
// branch — picks exactly one per build, so lib/health/sync.ts just
// imports `healthAdapter` from './adapter' and doesn't otherwise care
// which one it got.
export interface HealthAdapter {
  isAvailable(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  readSteps(sinceMs: number): Promise<RawStepsSample[]>;
  readActivities(sinceMs: number): Promise<RawActivitySample[]>;
  readNutrition(sinceMs: number): Promise<RawNutritionSample[]>;
}
