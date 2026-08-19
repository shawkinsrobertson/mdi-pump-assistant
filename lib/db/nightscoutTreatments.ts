import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { NightscoutTreatment } from '../nightscout/client';

// A local read-only cache of treatments pulled from Nightscout
// (lib/nightscout/sync.ts) — reference data, same treatment as
// lib/db/health.ts's activity/nutrition tables: shows up in the Logbook,
// feeds nothing in lib/oref/. Deduped by Nightscout's own `_id` (no
// `source` column needed the way glucose_readings/health tables have
// one — only one Nightscout instance is ever configured at a time,
// unlike xDrip+ vs. BLE vs. HealthKit vs. Health Connect all being live
// simultaneously).
export interface NightscoutTreatmentRecord {
  id: string;
  eventType: string | null;
  insulin: number | null;
  carbs: number | null;
  createdAt: string; // ISO 8601
  notes: string | null;
}

let db: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('mdi-pump-assistant.db');
    db.execSync(`
      CREATE TABLE IF NOT EXISTS nightscout_treatments (
        id TEXT PRIMARY KEY,
        event_type TEXT,
        insulin REAL,
        carbs REAL,
        created_at TEXT NOT NULL,
        notes TEXT
      );
    `);
  }
  return db;
}

interface NightscoutTreatmentRow {
  id: string;
  event_type: string | null;
  insulin: number | null;
  carbs: number | null;
  created_at: string;
  notes: string | null;
}

function fromRow(row: NightscoutTreatmentRow): NightscoutTreatmentRecord {
  return {
    id: row.id,
    eventType: row.event_type,
    insulin: row.insulin,
    carbs: row.carbs,
    createdAt: row.created_at,
    notes: row.notes,
  };
}

// 90 days — matches glucose_readings/health.ts's retention window.
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

// `created_at` comes straight from Nightscout's own field (lib/nightscout/client.ts),
// whose exact string format isn't guaranteed consistent — different
// uploaders (AndroidAPS, Loop, xDrip+, ...) format it differently (some
// omit milliseconds, some use a numeric timezone offset instead of "Z").
// Confirmed on-device: a SQL `WHERE created_at >= ?` string comparison
// against a canonical toISOString() value silently mismatched real rows
// — the Insights payload reported zero carb/insulin entries despite the
// Logbook showing genuinely-synced treatments (the Logbook's own query
// never compares dates, just `ORDER BY ... LIMIT`, so it never hit this).
// Every other table in this app avoids the whole problem by storing
// epoch ms as an INTEGER (glucose_readings.date, health.ts's
// start_time/logged_at) instead of a passthrough string — this table is
// the one place that didn't, and it's why. Rather than a schema
// migration (real risk to data already synced onto people's devices,
// with no way to test it here), every date-sensitive query below fetches
// the (small, personal-treatment-log-sized) full table once and
// filters/sorts using real `Date.parse()` timestamps in JS, which is
// robust to whatever format Nightscout actually sent.
async function getAllTreatments(): Promise<NightscoutTreatmentRecord[]> {
  const database = getDb();
  const rows = await database.getAllAsync<NightscoutTreatmentRow>(`SELECT * FROM nightscout_treatments`);
  return rows.map(fromRow);
}

async function pruneOldTreatments(): Promise<void> {
  const cutoffMs = Date.now() - RETENTION_MS;
  const all = await getAllTreatments();
  const staleIds = all.filter((t) => new Date(t.createdAt).getTime() < cutoffMs).map((t) => t.id);
  if (staleIds.length === 0) return;
  const database = getDb();
  // SQLite defaults to a 999-bound-parameter limit per statement —
  // chunked well under that. Unlikely to matter for a personal treatment
  // log, but cheap insurance.
  const CHUNK = 500;
  for (let i = 0; i < staleIds.length; i += CHUNK) {
    const chunk = staleIds.slice(i, i + CHUNK);
    await database.runAsync(`DELETE FROM nightscout_treatments WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
  }
}

export async function insertNightscoutTreatments(treatments: NightscoutTreatment[]): Promise<void> {
  if (treatments.length === 0) return;
  const database = getDb();
  for (const t of treatments) {
    await database.runAsync(
      `INSERT OR REPLACE INTO nightscout_treatments (id, event_type, insulin, carbs, created_at, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [t.id, t.eventType, t.insulin, t.carbs, t.createdAt, t.notes],
    );
  }
  await pruneOldTreatments();
}

export async function getRecentNightscoutTreatments(limit: number): Promise<NightscoutTreatmentRecord[]> {
  const all = await getAllTreatments();
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
}

// For the AI Insights payload (lib/insights/buildInsightPayload.ts),
// which needs "everything in the last windowDays" rather than "the most
// recent N rows" — same reason lib/db/health.ts has
// getHealthActivitiesSince alongside getRecentHealthActivities.
export async function getNightscoutTreatmentsSince(sinceMs: number): Promise<NightscoutTreatmentRecord[]> {
  const all = await getAllTreatments();
  return all
    .filter((t) => new Date(t.createdAt).getTime() >= sinceMs)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function deleteNightscoutTreatment(id: string): Promise<void> {
  const database = getDb();
  await database.runAsync(`DELETE FROM nightscout_treatments WHERE id = ?`, [id]);
}
