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
      CREATE INDEX IF NOT EXISTS idx_nightscout_treatments_created ON nightscout_treatments(created_at);
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
  const cutoffIso = new Date(Date.now() - RETENTION_MS).toISOString();
  await database.runAsync(`DELETE FROM nightscout_treatments WHERE created_at < ?`, [cutoffIso]);
}

export async function getRecentNightscoutTreatments(limit: number): Promise<NightscoutTreatmentRecord[]> {
  const database = getDb();
  const rows = await database.getAllAsync<NightscoutTreatmentRow>(
    `SELECT * FROM nightscout_treatments ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map(fromRow);
}

// For the AI Insights payload (lib/insights/buildInsightPayload.ts),
// which needs "everything in the last windowDays" rather than "the most
// recent N rows" — same reason lib/db/health.ts has
// getHealthActivitiesSince alongside getRecentHealthActivities.
export async function getNightscoutTreatmentsSince(sinceMs: number): Promise<NightscoutTreatmentRecord[]> {
  const database = getDb();
  const sinceIso = new Date(sinceMs).toISOString();
  const rows = await database.getAllAsync<NightscoutTreatmentRow>(
    `SELECT * FROM nightscout_treatments WHERE created_at >= ? ORDER BY created_at ASC`,
    [sinceIso],
  );
  return rows.map(fromRow);
}

export async function deleteNightscoutTreatment(id: string): Promise<void> {
  const database = getDb();
  await database.runAsync(`DELETE FROM nightscout_treatments WHERE id = ?`, [id]);
}
