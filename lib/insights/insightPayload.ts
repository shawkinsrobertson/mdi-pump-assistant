// Pure computation of the structured summary sent to the configured AI
// insights webhook — no DB/AsyncStorage access here, same split as
// lib/oref/predictionCore.ts vs runPrediction.ts, so this can be unit
// tested directly and reused identically by both the scheduled background
// task and the manual "Generate Insights Now" button (the whole point of
// factoring it out, per the source instructions: the two paths must never
// drift into two different payload shapes).
import type { ActivityRecord } from '../db/activities';
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
}

export function computeInsightPayload(inputs: InsightPayloadInputs): InsightPayload {
  const { now, windowDays, glucoseReadings, treatments, activities, notes, rangeLow, rangeHigh } = inputs;

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
  };
}
