// Thin I/O shell around insightPayload.ts's pure computeInsightPayload():
// fetches the real 7-day window of local data, then hands it off. Kept
// separate so the pure logic can be unit tested without expo-sqlite (see
// lib/oref/runPrediction.ts for the same split applied to predictions).
import { getActivitiesSince } from '../db/activities';
import { getReadingsSince } from '../db/glucoseReadings';
import { getRecentNoteEntries } from '../db/noteEntries';
import { getTreatmentsSince } from '../db/treatments';
import { computeInsightPayload, type InsightPayload } from './insightPayload';
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

  const [glucoseReadings, treatments, activities, recentNotes] = await Promise.all([
    getReadingsSince(sinceMs),
    getTreatmentsSince(sinceIso),
    getActivitiesSince(sinceIso),
    getRecentNoteEntries(RECENT_NOTES_FETCH_COUNT),
  ]);
  const notes = recentNotes.filter((n) => new Date(n.loggedAt).getTime() >= sinceMs);

  return computeInsightPayload({
    now,
    windowDays: WINDOW_DAYS,
    glucoseReadings,
    treatments,
    activities,
    notes,
    rangeLow: settings.rangeLow,
    rangeHigh: settings.rangeHigh,
  });
}
