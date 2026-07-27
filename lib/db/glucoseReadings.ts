import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { GlucoseReading } from '../glucose';

// Persists every CGM/BLE reading as it arrives, rather than keeping glucose
// history in memory only. This matters for the oref0 orchestration
// (lib/oref/runPrediction.ts): its COB/carb-absorption detection needs real
// glucose history, and relying on in-memory-only state would mean COB reads
// as empty/unreliable after every app restart. AndroidAPS has the same
// requirement and solves it the same way — persisting every received CGM
// value locally rather than trusting a live feed alone.
//
// `source` + `externalId` (the reading's own `_id`) form the dedup key so
// the same reading reported again by the same source (xDrip+ polling
// overlap, a BLE re-sync) never double-inserts, matching insertTreatment's
// dedup-at-write-time approach in lib/db/treatments.ts.

let db: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('mdi-pump-assistant.db');
    db.execSync(`
      CREATE TABLE IF NOT EXISTS glucose_readings (
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        sgv REAL NOT NULL,
        date INTEGER NOT NULL,
        date_string TEXT NOT NULL,
        delta REAL,
        direction TEXT,
        noise REAL,
        PRIMARY KEY (source, external_id)
      );
      CREATE INDEX IF NOT EXISTS idx_glucose_readings_date ON glucose_readings(date);
    `);
  }
  return db;
}

interface GlucoseReadingRow {
  source: string;
  external_id: string;
  sgv: number;
  date: number;
  date_string: string;
  delta: number | null;
  direction: string | null;
  noise: number | null;
}

function fromRow(row: GlucoseReadingRow): GlucoseReading {
  return {
    sgv: row.sgv,
    date: row.date,
    dateString: row.date_string,
    delta: row.delta ?? 0,
    direction: row.direction ?? 'None',
    noise: row.noise ?? 0,
    _id: row.external_id,
  };
}

// Bounds table growth — 24h is generously more than IOB (4h) or COB (6h)
// lookback ever need, plus margin for the delta-averaging windows inside
// glucose-get-last.js (up to ~42.5 minutes back).
const RETENTION_MS = 24 * 60 * 60 * 1000;

export async function insertReadings(source: string, readings: GlucoseReading[]): Promise<void> {
  if (readings.length === 0) return;
  const database = getDb();
  for (const r of readings) {
    await database.runAsync(
      `INSERT OR REPLACE INTO glucose_readings
         (source, external_id, sgv, date, date_string, delta, direction, noise)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [source, r._id, r.sgv, r.date, r.dateString, r.delta, r.direction, r.noise],
    );
  }
  await database.runAsync(`DELETE FROM glucose_readings WHERE date < ?`, [Date.now() - RETENTION_MS]);
}

export async function getReadingsSince(sinceMs: number): Promise<GlucoseReading[]> {
  const database = getDb();
  const rows = await database.getAllAsync<GlucoseReadingRow>(
    `SELECT * FROM glucose_readings WHERE date >= ? ORDER BY date ASC`,
    [sinceMs],
  );
  return rows.map(fromRow);
}

// For useGlucoseSource's hydrate-on-mount: it keys its in-memory map by
// "source:external_id" (see reportReading/replaceSource), so rebuilding
// that same key from persisted rows needs the source column too, which
// getReadingsSince's plain GlucoseReading[] doesn't carry.
export async function getReadingsSinceWithSource(
  sinceMs: number,
): Promise<Array<{ source: string; reading: GlucoseReading }>> {
  const database = getDb();
  const rows = await database.getAllAsync<GlucoseReadingRow>(
    `SELECT * FROM glucose_readings WHERE date >= ? ORDER BY date ASC`,
    [sinceMs],
  );
  return rows.map((row) => ({ source: row.source, reading: fromRow(row) }));
}
