import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

// A standalone free-text log entry (the "Notes" quick action) — distinct
// from the `notes` column on treatments/basal_doses, which annotates an
// existing entry rather than standing on its own. Named noteEntries.ts /
// `note_entries` to avoid confusion with that column.
export interface NoteEntryRecord {
  id: number;
  text: string;
  loggedAt: string; // ISO 8601
}

export interface NewNoteEntry {
  text: string;
  loggedAt: string;
}

export interface NoteEntryEdits {
  text: string;
}

export class DuplicateNoteEntryError extends Error {}

let db: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('mdi-pump-assistant.db');
    db.execSync(`
      CREATE TABLE IF NOT EXISTS note_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        logged_at TEXT NOT NULL
      );
    `);
  }
  return db;
}

interface NoteEntryRow {
  id: number;
  text: string;
  logged_at: string;
}

function fromRow(row: NoteEntryRow): NoteEntryRecord {
  return { id: row.id, text: row.text, loggedAt: row.logged_at };
}

export async function insertNoteEntry(input: NewNoteEntry): Promise<NoteEntryRecord> {
  const database = getDb();
  const loggedAtSecond = input.loggedAt.slice(0, 19);

  const duplicate = await database.getFirstAsync<NoteEntryRow>(
    `SELECT * FROM note_entries WHERE text = ? AND substr(logged_at, 1, 19) = ?`,
    [input.text, loggedAtSecond],
  );
  if (duplicate) {
    throw new DuplicateNoteEntryError('A matching note was already logged within the last second — refusing to double-log.');
  }

  const result = await database.runAsync(`INSERT INTO note_entries (text, logged_at) VALUES (?, ?)`, [
    input.text,
    input.loggedAt,
  ]);

  return { id: result.lastInsertRowId, text: input.text, loggedAt: input.loggedAt };
}

export async function getRecentNoteEntries(count: number): Promise<NoteEntryRecord[]> {
  const database = getDb();
  const rows = await database.getAllAsync<NoteEntryRow>(
    `SELECT * FROM note_entries ORDER BY logged_at DESC LIMIT ?`,
    [count],
  );
  return rows.map(fromRow);
}

export async function updateNoteEntry(id: number, edits: NoteEntryEdits): Promise<void> {
  const database = getDb();
  await database.runAsync(`UPDATE note_entries SET text = ? WHERE id = ?`, [edits.text, id]);
}

export async function deleteNoteEntry(id: number): Promise<void> {
  const database = getDb();
  await database.runAsync(`DELETE FROM note_entries WHERE id = ?`, [id]);
}
