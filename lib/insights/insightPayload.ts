// Pure computation of the structured summary sent to the configured AI
// insights webhook — no DB/AsyncStorage access here, same split as
// lib/oref/predictionCore.ts vs runPrediction.ts, so this can be unit
// tested directly and reused identically by both the scheduled background
// task and the manual "Generate Insights Now" button (the whole point of
// factoring it out, per the source instructions: the two paths must never
// drift into two different payload shapes).
import type { ActivityRecord } from '../db/activities';
import type { DailyStepsTotal, HealthActivityRecord, HealthNutritionRecord } from '../db/health';
import type { NoteEntryRecord } from '../db/noteEntries';
import type { Treatment } from '../db/treatments';
import type { GlucoseReading } from '../glucose';
import { computeAgpSummary, type AgpSummary } from '../trends/agp';
import { computeTimeInRange, type TimeInRangeResult } from '../trends/timeInRange';

// Battelino et al. 2019 international consensus report's level-2
// hypo/hyperglycemia thresholds — the same published clinical convention
// already cited for the Time in Range/AGP cards elsewhere in this app
// (see lib/trends/agp.ts), not invented for this feature.
const SEVERE_LOW_THRESHOLD = 54;
const SEVERE_HIGH_THRESHOLD = 250;

// "Overnight" for the purpose of flagging overnight lows — midnight to
// 6am local time, a common clinical convention for this kind of report.
const OVERNIGHT_START_HOUR = 0;
const OVERNIGHT_END_HOUR = 6;

// Steps/activity/nutrition pulled from HealthKit/Health Connect
// (lib/health/sync.ts) — read-only, reference data (see AGENTS.md for
// why it's never fed into oref0's COB/IOB math), but the person
// explicitly wants the AI-generated insight to be able to reference it
// (e.g. "you had 3 workouts this week" or "carb entries from your
// nutrition app don't always have a matching treatment logged"). Kept
// as one summarized block, not raw per-record dumps, matching
// `treatmentsLogged` below's own level of detail — the model gets
// enough to reason about patterns without the payload growing with
// every synced record.
export interface ImportedHealthDataSummary {
  dailySteps: DailyStepsTotal[]; // one entry per day with data, at most windowDays long
  activitySessionCount: number;
  activityMinutesTotal: number;
  activityTypes: string[]; // distinct titles, e.g. ["Running", "Cycling"]
  nutritionEntryCount: number;
  nutritionCarbsGramsTotal: number;
}

export interface InsightPayload {
  generatedAt: string; // ISO 8601
  windowDays: number;
  rangeLow: number;
  rangeHigh: number;
  readingCount: number;
  timeInRange: TimeInRangeResult;
  glucoseSummary: AgpSummary | null;
  severeLowCount: number;
  severeHighCount: number;
  // null (not 0) when there's no overnight-window data at all yet — same
  // "distinguish no-data from genuinely zero" reasoning as
  // TimeInRangeResult.count elsewhere in this codebase.
  overnightLowPct: number | null;
  treatmentsLogged: {
    carbEntries: number;
    insulinEntries: number;
    activityEntries: number;
    noteEntries: number;
  };
  // null when Health sync isn't enabled (Settings > Integrations) —
  // distinct from an enabled-but-empty summary, same "no data" vs.
  // "genuinely zero" distinction as overnightLowPct above.
  importedHealthData: ImportedHealthDataSummary | null;
}

export interface InsightPayloadInputs {
  now: Date;
  windowDays: number;
  glucoseReadings: GlucoseReading[];
  treatments: Treatment[];
  activities: ActivityRecord[];
  notes: NoteEntryRecord[];
  rangeLow: number;
  rangeHigh: number;
  healthSyncEnabled: boolean;
  dailySteps: DailyStepsTotal[];
  healthActivities: HealthActivityRecord[];
  healthNutrition: HealthNutritionRecord[];
}

function summarizeImportedHealthData(
  healthSyncEnabled: boolean,
  dailySteps: DailyStepsTotal[],
  healthActivities: HealthActivityRecord[],
  healthNutrition: HealthNutritionRecord[],
): ImportedHealthDataSummary | null {
  if (!healthSyncEnabled) return null;
  return {
    dailySteps,
    activitySessionCount: healthActivities.length,
    activityMinutesTotal: Math.round(
      healthActivities.reduce((sum, a) => sum + (a.durationMinutes ?? 0), 0),
    ),
    activityTypes: Array.from(new Set(healthActivities.map((a) => a.title))),
    nutritionEntryCount: healthNutrition.length,
    nutritionCarbsGramsTotal: Math.round(healthNutrition.reduce((sum, n) => sum + n.carbsGrams, 0)),
  };
}

export function computeInsightPayload(inputs: InsightPayloadInputs): InsightPayload {
  const {
    now,
    windowDays,
    glucoseReadings,
    treatments,
    activities,
    notes,
    rangeLow,
    rangeHigh,
    healthSyncEnabled,
    dailySteps,
    healthActivities,
    healthNutrition,
  } = inputs;

  let severeLowCount = 0;
  let severeHighCount = 0;
  let overnightBelow = 0;
  let overnightTotal = 0;
  for (const r of glucoseReadings) {
    if (r.sgv < SEVERE_LOW_THRESHOLD) severeLowCount++;
    if (r.sgv > SEVERE_HIGH_THRESHOLD) severeHighCount++;
    const hour = new Date(r.date).getHours();
    if (hour >= OVERNIGHT_START_HOUR && hour < OVERNIGHT_END_HOUR) {
      overnightTotal++;
      if (r.sgv < rangeLow) overnightBelow++;
    }
  }

  return {
    generatedAt: now.toISOString(),
    windowDays,
    rangeLow,
    rangeHigh,
    readingCount: glucoseReadings.length,
    timeInRange: computeTimeInRange(glucoseReadings, rangeLow, rangeHigh),
    glucoseSummary: computeAgpSummary(glucoseReadings),
    severeLowCount,
    severeHighCount,
    overnightLowPct: overnightTotal > 0 ? Math.round((100 * overnightBelow) / overnightTotal) : null,
    treatmentsLogged: {
      carbEntries: treatments.filter((t) => t.carbs != null).length,
      insulinEntries: treatments.filter((t) => t.insulin != null).length,
      activityEntries: activities.length,
      noteEntries: notes.length,
    },
    importedHealthData: summarizeImportedHealthData(healthSyncEnabled, dailySteps, healthActivities, healthNutrition),
  };
}
