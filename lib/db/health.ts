import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

// Three tables for data pulled from HealthKit (iOS) / Health Connect
// (Android) — see lib/health/sync.ts for the platform adapters that
// populate these. All three are read-only imports: nothing written here
// ever feeds oref0's COB/IOB calculation (lib/oref/) the way a manually
// logged treatment does — see AGENTS.md for why that's a deliberate
// choice, not an oversight. `source` + `external_id` (the record's own
// HealthKit/Health Connect identifier) form the dedup key, same approach
// as lib/db/glucoseReadings.ts, so re-syncing the same window never
// double-inserts.

export type HealthSource = 'healthkit' | 'healthconnect';

export interface HealthStepsRecord {
  source: HealthSource;
  externalId: string;
  count: number;
  startTime: number; // epoch ms
  endTime: number;
}

export interface HealthActivityRecord {
  source: HealthSource;
  externalId: string;
  title: string;
  durationMinutes: number | null;
  calories: number | null;
  startTime: number;
  endTime: number;
}

export interface HealthNutritionRecord {
  source: HealthSource;
  externalId: string;
  carbsGrams: number;
  loggedAt: number;
}

let db: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('mdi-pump-assistant.db');
    db.execSync(`
      CREATE TABLE IF NOT EXISTS health_steps (
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        count INTEGER NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        PRIMARY KEY (source, external_id)
      );
      CREATE INDEX IF NOT EXISTS idx_health_steps_start ON health_steps(start_time);

      CREATE TABLE IF NOT EXISTS health_activities (
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        duration_minutes REAL,
        calories REAL,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        PRIMARY KEY (source, external_id)
      );
      CREATE INDEX IF NOT EXISTS idx_health_activities_start ON health_activities(start_time);

      CREATE TABLE IF NOT EXISTS health_nutrition (
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        carbs_grams REAL NOT NULL,
        logged_at INTEGER NOT NULL,
        PRIMARY KEY (source, external_id)
      );
      CREATE INDEX IF NOT EXISTS idx_health_nutrition_logged ON health_nutrition(logged_at);
    `);
  }
  return db;
}

// 90 days — matches glucose_readings' retention window (lib/db/glucoseReadings.ts);
// this is reference data, not something the Trends screen needs beyond
// the longest window it offers.
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

// The platform adapters (lib/health/adapter.ios.ts, lib/health/adapter.android.ts)
// don't know their own source tag — lib/health/sync.ts does, once, based
// on Platform.OS — so these take it as a separate argument rather than
// requiring every adapter to stamp it onto each record itself.
export async function insertHealthSteps(
  source: HealthSource,
  records: Omit<HealthStepsRecord, 'source'>[],
): Promise<void> {
  if (records.length === 0) return;
  const database = getDb();
  for (const r of records) {
    await database.runAsync(
      `INSERT OR REPLACE INTO health_steps (source, external_id, count, start_time, end_time) VALUES (?, ?, ?, ?, ?)`,
      [source, r.externalId, r.count, r.startTime, r.endTime],
    );
  }
  await database.runAsync(`DELETE FROM health_steps WHERE start_time < ?`, [Date.now() - RETENTION_MS]);
}

export async function insertHealthActivities(
  source: HealthSource,
  records: Omit<HealthActivityRecord, 'source'>[],
): Promise<void> {
  if (records.length === 0) return;
  const database = getDb();
  for (const r of records) {
    await database.runAsync(
      `INSERT OR REPLACE INTO health_activities
         (source, external_id, title, duration_minutes, calories, start_time, end_time)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [source, r.externalId, r.title, r.durationMinutes, r.calories, r.startTime, r.endTime],
    );
  }
  await database.runAsync(`DELETE FROM health_activities WHERE start_time < ?`, [Date.now() - RETENTION_MS]);
}

export async function insertHealthNutrition(
  source: HealthSource,
  records: Omit<HealthNutritionRecord, 'source'>[],
): Promise<void> {
  if (records.length === 0) return;
  const database = getDb();
  for (const r of records) {
    await database.runAsync(
      `INSERT OR REPLACE INTO health_nutrition (source, external_id, carbs_grams, logged_at) VALUES (?, ?, ?, ?)`,
      [source, r.externalId, r.carbsGrams, r.loggedAt],
    );
  }
  await database.runAsync(`DELETE FROM health_nutrition WHERE logged_at < ?`, [Date.now() - RETENTION_MS]);
}

interface StepsRow {
  source: HealthSource;
  external_id: string;
  count: number;
  start_time: number;
  end_time: number;
}

interface ActivityRow {
  source: HealthSource;
  external_id: string;
  title: string;
  duration_minutes: number | null;
  calories: number | null;
  start_time: number;
  end_time: number;
}

interface NutritionRow {
  source: HealthSource;
  external_id: string;
  carbs_grams: number;
  logged_at: number;
}

function activityFromRow(row: ActivityRow): HealthActivityRecord {
  return {
    source: row.source,
    externalId: row.external_id,
    title: row.title,
    durationMinutes: row.duration_minutes,
    calories: row.calories,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

function nutritionFromRow(row: NutritionRow): HealthNutritionRecord {
  return { source: row.source, externalId: row.external_id, carbsGrams: row.carbs_grams, loggedAt: row.logged_at };
}

// For the Logbook's imported-activity/imported-nutrition row types —
// across both sources, since only one is ever populated on a given
// device (a phone runs either iOS or Android, never both), so there's no
// "continuous feed floods the list" concern the way BLE's glucose
// readings vs. xDrip+'s CGM stream had (lib/db/glucoseReadings.ts) —
// discrete workouts and meal entries are naturally low-frequency.
export async function getRecentHealthActivities(limit: number): Promise<HealthActivityRecord[]> {
  const database = getDb();
  const rows = await database.getAllAsync<ActivityRow>(
    `SELECT * FROM health_activities ORDER BY start_time DESC LIMIT ?`,
    [limit],
  );
  return rows.map(activityFromRow);
}

export async function getRecentHealthNutrition(limit: number): Promise<HealthNutritionRecord[]> {
  const database = getDb();
  const rows = await database.getAllAsync<NutritionRow>(
    `SELECT * FROM health_nutrition ORDER BY logged_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map(nutritionFromRow);
}

// For the AI Insights payload (lib/insights/buildInsightPayload.ts),
// which needs "everything in the last windowDays" rather than "the most
// recent N rows" — same reason lib/db/treatments.ts has both
// getRecentTreatments(count) and getTreatmentsSince(timestamp).
export async function getHealthActivitiesSince(sinceMs: number): Promise<HealthActivityRecord[]> {
  const database = getDb();
  const rows = await database.getAllAsync<ActivityRow>(
    `SELECT * FROM health_activities WHERE start_time >= ? ORDER BY start_time ASC`,
    [sinceMs],
  );
  return rows.map(activityFromRow);
}

export async function getHealthNutritionSince(sinceMs: number): Promise<HealthNutritionRecord[]> {
  const database = getDb();
  const rows = await database.getAllAsync<NutritionRow>(
    `SELECT * FROM health_nutrition WHERE logged_at >= ? ORDER BY logged_at ASC`,
    [sinceMs],
  );
  return rows.map(nutritionFromRow);
}

export async function deleteHealthActivity(source: HealthSource, externalId: string): Promise<void> {
  const database = getDb();
  await database.runAsync(`DELETE FROM health_activities WHERE source = ? AND external_id = ?`, [source, externalId]);
}

export async function deleteHealthNutrition(source: HealthSource, externalId: string): Promise<void> {
  const database = getDb();
  await database.runAsync(`DELETE FROM health_nutrition WHERE source = ? AND external_id = ?`, [source, externalId]);
}

// For the Trends "Steps" card: daily totals over a window, in the
// device's local calendar day (not UTC midnight) — matches how a person
// actually thinks about "yesterday's steps." Summed in JS rather than
// SQL's date() (which is UTC-only) since start_time is a raw epoch ms
// column.
export interface DailyStepsTotal {
  dayKey: string; // "YYYY-MM-DD", local
  count: number;
}

export async function getStepsTotalsSince(sinceMs: number): Promise<DailyStepsTotal[]> {
  const database = getDb();
  const rows = await database.getAllAsync<StepsRow>(`SELECT * FROM health_steps WHERE start_time >= ?`, [sinceMs]);
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const d = new Date(row.start_time);
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + row.count);
  }
  return Array.from(byDay.entries())
    .map(([dayKey, count]) => ({ dayKey, count }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}
