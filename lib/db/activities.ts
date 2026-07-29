import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

export type ActivityIntensity = 'low' | 'med' | 'high';

export interface ActivityRecord {
  id: number;
  intensity: ActivityIntensity;
  durationMinutes: number | null;
  loggedAt: string; // ISO 8601
}

export interface NewActivity {
  intensity: ActivityIntensity;
  durationMinutes: number | null;
  loggedAt: string;
}

export interface ActivityEdits {
  intensity: ActivityIntensity;
  durationMinutes: number | null;
}

export class DuplicateActivityError extends Error {}

let db: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('mdi-pump-assistant.db');
    db.execSync(`
      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        intensity TEXT NOT NULL,
        duration_minutes REAL,
        logged_at TEXT NOT NULL
      );
    `);
  }
  return db;
}

interface ActivityRow {
  id: number;
  intensity: ActivityIntensity;
  duration_minutes: number | null;
  logged_at: string;
}

function fromRow(row: ActivityRow): ActivityRecord {
  return { id: row.id, intensity: row.intensity, durationMinutes: row.duration_minutes, loggedAt: row.logged_at };
}

// Same dedup-at-write-time approach as treatments/basal doses: a
// double-tap must not silently log the same activity twice.
export async function insertActivity(input: NewActivity): Promise<ActivityRecord> {
  const database = getDb();
  const loggedAtSecond = input.loggedAt.slice(0, 19);

  const duplicate = await database.getFirstAsync<ActivityRow>(
    `SELECT * FROM activities WHERE intensity = ? AND duration_minutes IS ? AND substr(logged_at, 1, 19) = ?`,
    [input.intensity, input.durationMinutes, loggedAtSecond],
  );
  if (duplicate) {
    throw new DuplicateActivityError('A matching activity was already logged within the last second — refusing to double-log.');
  }

  const result = await database.runAsync(
    `INSERT INTO activities (intensity, duration_minutes, logged_at) VALUES (?, ?, ?)`,
    [input.intensity, input.durationMinutes, input.loggedAt],
  );

  return { id: result.lastInsertRowId, intensity: input.intensity, durationMinutes: input.durationMinutes, loggedAt: input.loggedAt };
}

export async function getRecentActivities(count: number): Promise<ActivityRecord[]> {
  const database = getDb();
  const rows = await database.getAllAsync<ActivityRow>(
    `SELECT * FROM activities ORDER BY logged_at DESC LIMIT ?`,
    [count],
  );
  return rows.map(fromRow);
}

export async function getActivitiesSince(timestamp: string): Promise<ActivityRecord[]> {
  const database = getDb();
  const rows = await database.getAllAsync<ActivityRow>(
    `SELECT * FROM activities WHERE logged_at >= ? ORDER BY logged_at ASC`,
    [timestamp],
  );
  return rows.map(fromRow);
}

export async function updateActivity(id: number, edits: ActivityEdits): Promise<void> {
  const database = getDb();
  await database.runAsync(`UPDATE activities SET intensity = ?, duration_minutes = ? WHERE id = ?`, [
    edits.intensity,
    edits.durationMinutes,
    id,
  ]);
}

export async function deleteActivity(id: number): Promise<void> {
  const database = getDb();
  await database.runAsync(`DELETE FROM activities WHERE id = ?`, [id]);
}
