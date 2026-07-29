import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

// eventType values are always rapid-acting bolus categories today (no
// basal/long-acting concept exists in this schema yet) — see lib/iob.ts,
// which relies on that to treat every row's `insulin` as bolus IOB.
export type EventType = 'Meal Bolus' | 'Correction Bolus';

export interface Treatment {
  id: number;
  eventType: EventType;
  insulin: number | null;
  carbs: number | null;
  createdAt: string; // ISO 8601
  notes: string | null;
}

export interface NewTreatment {
  eventType: EventType;
  insulin: number | null;
  carbs: number | null;
  createdAt: string; // ISO 8601
  notes?: string | null;
}

export interface TreatmentEdits {
  eventType: EventType;
  insulin: number | null;
  carbs: number | null;
  notes: string | null;
}

export class DuplicateTreatmentError extends Error {}

let db: SQLiteDatabase | null = null;

// Lazy, same reasoning as the BLE manager: opening the database is a
// native call, so defer it until something actually needs it rather than
// doing it at module load.
function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('mdi-pump-assistant.db');
    db.execSync(`
      CREATE TABLE IF NOT EXISTS treatments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        insulin REAL,
        carbs REAL,
        created_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      );
    `);
    // Migration for installs created before the `notes` column existed —
    // ALTER TABLE has no IF NOT EXISTS, so guard with a try/catch instead.
    try {
      db.execSync(`ALTER TABLE treatments ADD COLUMN notes TEXT;`);
    } catch {
      // column already exists
    }
  }
  return db;
}

interface TreatmentRow {
  id: number;
  event_type: EventType;
  insulin: number | null;
  carbs: number | null;
  created_at: string;
  notes: string | null;
}

function fromRow(row: TreatmentRow): Treatment {
  return {
    id: row.id,
    eventType: row.event_type,
    insulin: row.insulin,
    carbs: row.carbs,
    createdAt: row.created_at,
    notes: row.notes ?? null,
  };
}

// Dedup at write time, not just read time: a double-tap or a UI retry
// after an ambiguous result must not silently double-log a dose. "Same
// second" compares createdAt truncated to whole-second precision (drops
// milliseconds), matching realistic double-submit timing.
export async function insertTreatment(input: NewTreatment): Promise<Treatment> {
  const database = getDb();
  const createdAtSecond = input.createdAt.slice(0, 19);

  const duplicate = await database.getFirstAsync<TreatmentRow>(
    `SELECT * FROM treatments
     WHERE event_type = ?
       AND insulin IS ?
       AND carbs IS ?
       AND substr(created_at, 1, 19) = ?`,
    [input.eventType, input.insulin, input.carbs, createdAtSecond],
  );
  if (duplicate) {
    throw new DuplicateTreatmentError(
      'A matching treatment was already logged within the last second — refusing to double-log.',
    );
  }

  const notes = input.notes ?? null;
  const result = await database.runAsync(
    `INSERT INTO treatments (event_type, insulin, carbs, created_at, notes) VALUES (?, ?, ?, ?, ?)`,
    [input.eventType, input.insulin, input.carbs, input.createdAt, notes],
  );

  return {
    id: result.lastInsertRowId,
    eventType: input.eventType,
    insulin: input.insulin,
    carbs: input.carbs,
    createdAt: input.createdAt,
    notes,
  };
}

export async function updateTreatment(id: number, edits: TreatmentEdits): Promise<void> {
  const database = getDb();
  await database.runAsync(
    `UPDATE treatments SET event_type = ?, insulin = ?, carbs = ?, notes = ? WHERE id = ?`,
    [edits.eventType, edits.insulin, edits.carbs, edits.notes, id],
  );
}

export async function deleteTreatment(id: number): Promise<void> {
  const database = getDb();
  await database.runAsync(`DELETE FROM treatments WHERE id = ?`, [id]);
}

export async function getRecentTreatments(count: number): Promise<Treatment[]> {
  const database = getDb();
  const rows = await database.getAllAsync<TreatmentRow>(
    `SELECT * FROM treatments ORDER BY created_at DESC LIMIT ?`,
    [count],
  );
  return rows.map(fromRow);
}

// Time-windowed query — IOB/COB math (and, later, oref) need "everything
// in the last N hours," not just "the most recent N rows": a quiet
// stretch followed by a burst of entries would otherwise cut off older
// still-active insulin.
export async function getTreatmentsSince(timestamp: string): Promise<Treatment[]> {
  const database = getDb();
  const rows = await database.getAllAsync<TreatmentRow>(
    `SELECT * FROM treatments WHERE created_at >= ? ORDER BY created_at ASC`,
    [timestamp],
  );
  return rows.map(fromRow);
}
