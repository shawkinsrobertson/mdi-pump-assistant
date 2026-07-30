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
  notes: string | null;
  // Only meaningful when type === 'other' — see lib/mdi/basalCurve.ts.
  customName: string | null;
  customDurationHours: number | null;
}

export interface NewBasalDose {
  type: LongActingInsulinType;
  units: number;
  injectedAt: string; // ISO 8601
  notes?: string | null;
  customName?: string | null;
  customDurationHours?: number | null;
}

export interface BasalDoseEdits {
  type: LongActingInsulinType;
  units: number;
  notes: string | null;
  customName: string | null;
  customDurationHours: number | null;
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
    // Migrations for columns added after initial release — ALTER TABLE has
    // no IF NOT EXISTS, so guard each with its own try/catch instead.
    for (const ddl of [
      `ALTER TABLE basal_doses ADD COLUMN notes TEXT;`,
      `ALTER TABLE basal_doses ADD COLUMN custom_name TEXT;`,
      `ALTER TABLE basal_doses ADD COLUMN custom_duration_hours REAL;`,
    ]) {
      try {
        db.execSync(ddl);
      } catch {
        // column already exists
      }
    }
  }
  return db;
}

interface BasalDoseRow {
  id: number;
  type: LongActingInsulinType;
  units: number;
  injected_at: string;
  notes: string | null;
  custom_name: string | null;
  custom_duration_hours: number | null;
}

function fromRow(row: BasalDoseRow): BasalDoseRecord {
  return {
    id: row.id,
    type: row.type,
    units: row.units,
    injectedAt: row.injected_at,
    notes: row.notes ?? null,
    customName: row.custom_name ?? null,
    customDurationHours: row.custom_duration_hours ?? null,
  };
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

  const notes = input.notes ?? null;
  const customName = input.customName ?? null;
  const customDurationHours = input.customDurationHours ?? null;
  const result = await database.runAsync(
    `INSERT INTO basal_doses (type, units, injected_at, notes, custom_name, custom_duration_hours) VALUES (?, ?, ?, ?, ?, ?)`,
    [input.type, input.units, input.injectedAt, notes, customName, customDurationHours],
  );

  return {
    id: result.lastInsertRowId,
    type: input.type,
    units: input.units,
    injectedAt: input.injectedAt,
    notes,
    customName,
    customDurationHours,
  };
}

export async function updateBasalDose(id: number, edits: BasalDoseEdits): Promise<void> {
  const database = getDb();
  await database.runAsync(
    `UPDATE basal_doses SET type = ?, units = ?, notes = ?, custom_name = ?, custom_duration_hours = ? WHERE id = ?`,
    [edits.type, edits.units, edits.notes, edits.customName, edits.customDurationHours, id],
  );
}

export async function deleteBasalDose(id: number): Promise<void> {
  const database = getDb();
  await database.runAsync(`DELETE FROM basal_doses WHERE id = ?`, [id]);
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
