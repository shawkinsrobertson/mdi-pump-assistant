// Thin I/O shell around insightPayload.ts's pure computeInsightPayload():
// fetches the real 7-day window of local data, then hands it off. Kept
// separate so the pure logic can be unit tested without expo-sqlite (see
// lib/oref/runPrediction.ts for the same split applied to predictions).
import { getActivitiesSince } from '../db/activities';
import { getReadingsSince } from '../db/glucoseReadings';
import { getHealthActivitiesSince, getHealthNutritionSince, getStepsTotalsSince } from '../db/health';
import { getNightscoutTreatmentsSince, getRecentNightscoutTreatments } from '../db/nightscoutTreatments';
import { getRecentNoteEntries } from '../db/noteEntries';
import { getTreatmentsSince } from '../db/treatments';
import { computeInsightPayload, type InsightPayload } from './insightPayload';
import { isNightscoutConfigured } from '../nightscout/sync';
import { readSettings } from '../settings';
import { windowStartMs } from '../trends/window';

// Matches the background task's "roughly weekly" cadence and Trends'
// default 7-day window — a week of context per insight run.
const WINDOW_DAYS = 7;

// note_entries has no getNoteEntriesSince() (only getRecentNoteEntries(count)
// — see lib/db/noteEntries.ts), so fetch generously and let the window
// filter below bound it, rather than adding a new DB query shape just for
// this one caller. 200 comfortably covers a week of personal note-taking.
const RECENT_NOTES_FETCH_COUNT = 200;

export async function buildInsightPayload(now: Date = new Date()): Promise<InsightPayload> {
  const settings = await readSettings();
  const sinceMs = windowStartMs(WINDOW_DAYS, now);
  const sinceIso = new Date(sinceMs).toISOString();

  // Health/Nightscout tables are only actually queried when each is
  // configured — an empty-array default otherwise, rather than hitting
  // DB tables that will just be empty anyway (no sync ever having run).
  const [
    glucoseReadings,
    treatments,
    activities,
    recentNotes,
    dailySteps,
    healthActivities,
    healthNutrition,
    nightscoutTreatments,
  ] = await Promise.all([
    getReadingsSince(sinceMs),
    getTreatmentsSince(sinceIso),
    getActivitiesSince(sinceIso),
    getRecentNoteEntries(RECENT_NOTES_FETCH_COUNT),
    settings.healthSyncEnabled ? getStepsTotalsSince(sinceMs) : Promise.resolve([]),
    settings.healthSyncEnabled ? getHealthActivitiesSince(sinceMs) : Promise.resolve([]),
    settings.healthSyncEnabled ? getHealthNutritionSince(sinceMs) : Promise.resolve([]),
    isNightscoutConfigured(settings) ? getNightscoutTreatmentsSince(sinceMs) : Promise.resolve([]),
  ]);
  const notes = recentNotes.filter((n) => new Date(n.loggedAt).getTime() >= sinceMs);

  // TEMPORARY diagnostic logging for the "Insights reports zero
  // carb/insulin entries" investigation — remove once resolved. Narrows
  // down whether nightscoutTreatments is empty because (a) Nightscout
  // isn't configured, (b) the table itself has nothing in the 7-day
  // window (which would make 0 correct, not a bug), or (c) rows are
  // present but carbs/insulin came back null on all of them.
  console.log('[INSIGHTS DIAG] isNightscoutConfigured:', isNightscoutConfigured(settings));
  console.log('[INSIGHTS DIAG] window: since', sinceIso, 'now', now.toISOString());
  console.log('[INSIGHTS DIAG] nightscoutTreatments in window:', nightscoutTreatments.length);
  console.log(
    '[INSIGHTS DIAG] nightscoutTreatments detail:',
    nightscoutTreatments.map((t) => ({ id: t.id, createdAt: t.createdAt, carbs: t.carbs, insulin: t.insulin, eventType: t.eventType })),
  );
  // Unwindowed — the 10 most recent rows in the local table regardless of
  // date, same query the Logbook itself uses. If this is non-empty but
  // the windowed list above is empty, the rows exist but are simply
  // older than 7 days (correct 0, not a bug). If this is ALSO empty, the
  // sync itself isn't populating the table the way the Logbook screen
  // showed it did.
  const recentUnwindowed = await getRecentNightscoutTreatments(10);
  console.log(
    '[INSIGHTS DIAG] 10 most recent nightscout_treatments rows (unwindowed):',
    recentUnwindowed.map((t) => ({ id: t.id, createdAt: t.createdAt, carbs: t.carbs, insulin: t.insulin, eventType: t.eventType })),
  );

  return computeInsightPayload({
    now,
    windowDays: WINDOW_DAYS,
    glucoseReadings,
    treatments,
    activities,
    notes,
    rangeLow: settings.rangeLow,
    rangeHigh: settings.rangeHigh,
    healthSyncEnabled: settings.healthSyncEnabled,
    dailySteps,
    healthActivities,
    healthNutrition,
    nightscoutTreatments,
  });
}
