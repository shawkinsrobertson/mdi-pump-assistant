import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { LongActingInsulinType } from '../mdi/basalCurve';

// Logs each long-acting (basal) insulin injection as its own event —
// mirroring how treatments.ts logs each bolus — rather than a single
// "current regimen" setting. basalCurve.ts's currentBasalRate() is
// designed to sum contributions from a list of doses over time (handling
// dose changes, daily injections, and multi-day insulins like degludec
// overlapping), so the data model needs to be a log, not a snapshot.

export interface BasalDoseRecord {
  id: number;
  type: LongActingInsulinType;
  units: number;
  injectedAt: string; // ISO 8601
}

export interface NewBasalDose {
  type: LongActingInsulinType;
  units: number;
  injectedAt: string; // ISO 8601
}

export class DuplicateBasalDoseError extends Error {}

let db: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('mdi-pump-assistant.db');
    db.execSync(`
      CREATE TABLE IF NOT EXISTS basal_doses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        units REAL NOT NULL,
        injected_at TEXT NOT NULL
      );
    `);
  }
  return db;
}

interface BasalDoseRow {
  id: number;
  type: LongActingInsulinType;
  units: number;
  injected_at: string;
}

function fromRow(row: BasalDoseRow): BasalDoseRecord {
  return { id: row.id, type: row.type, units: row.units, injectedAt: row.injected_at };
}

// Same dedup-at-write-time approach as insertTreatment: a double-tap must
// not silently log the same injection twice.
export async function insertBasalDose(input: NewBasalDose): Promise<BasalDoseRecord> {
  const database = getDb();
  const injectedAtSecond = input.injectedAt.slice(0, 19);

  const duplicate = await database.getFirstAsync<BasalDoseRow>(
    `SELECT * FROM basal_doses
     WHERE type = ? AND units = ? AND substr(injected_at, 1, 19) = ?`,
    [input.type, input.units, injectedAtSecond],
  );
  if (duplicate) {
    throw new DuplicateBasalDoseError(
      'A matching basal dose was already logged within the last second — refusing to double-log.',
    );
  }

  const result = await database.runAsync(
    `INSERT INTO basal_doses (type, units, injected_at) VALUES (?, ?, ?)`,
    [input.type, input.units, input.injectedAt],
  );

  return { id: result.lastInsertRowId, type: input.type, units: input.units, injectedAt: input.injectedAt };
}

export async function getRecentBasalDoses(count: number): Promise<BasalDoseRecord[]> {
  const database = getDb();
  const rows = await database.getAllAsync<BasalDoseRow>(
    `SELECT * FROM basal_doses ORDER BY injected_at DESC LIMIT ?`,
    [count],
  );
  return rows.map(fromRow);
}

// For basalCurve.ts's currentBasalRate(): doses whose activity could still
// be non-zero at `atTime` (i.e. injected within the longest profile
// duration — degludec's ~42h — before it). Widening the window costs
// nothing since basalRateFromDose returns 0 outside a dose's own duration.
export async function getRecentBasalDosesSince(sinceMs: number): Promise<BasalDoseRecord[]> {
  const database = getDb();
  const rows = await database.getAllAsync<BasalDoseRow>(
    `SELECT * FROM basal_doses WHERE injected_at >= ? ORDER BY injected_at ASC`,
    [new Date(sinceMs).toISOString()],
  );
  return rows.map(fromRow);
}
