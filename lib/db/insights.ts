import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

// Persists the result of every insight-generation run (scheduled or
// manual — see lib/tasks/insightTask.ts) so the Trends screen always has
// something to render, even if the background task last ran hours ago
// and the person hasn't reopened the app since. `payload`/`insight` are
// stored as JSON text rather than normalized columns since both are
// opaque blobs from this layer's point of view — the payload shape is
// defined in lib/insights/insightPayload.ts, and the insight shape is
// whatever the configured webhook returns.
export type InsightSource = 'scheduled' | 'manual';

export interface InsightRecord {
  id: number;
  generatedAt: string; // ISO 8601
  payload: unknown;
  insight: unknown;
  source: InsightSource;
}

export interface NewInsight {
  generatedAt: string;
  payload: unknown;
  insight: unknown;
  source: InsightSource;
}

let db: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('mdi-pump-assistant.db');
    db.execSync(`
      CREATE TABLE IF NOT EXISTS insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        generated_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        insight TEXT NOT NULL,
        source TEXT NOT NULL
      );
    `);
  }
  return db;
}

interface InsightRow {
  id: number;
  generated_at: string;
  payload: string;
  insight: string;
  source: InsightSource;
}

function fromRow(row: InsightRow): InsightRecord {
  return {
    id: row.id,
    generatedAt: row.generated_at,
    payload: JSON.parse(row.payload),
    insight: JSON.parse(row.insight),
    source: row.source,
  };
}

export async function insertInsight(input: NewInsight): Promise<InsightRecord> {
  const database = getDb();
  const result = await database.runAsync(
    `INSERT INTO insights (generated_at, payload, insight, source) VALUES (?, ?, ?, ?)`,
    [input.generatedAt, JSON.stringify(input.payload), JSON.stringify(input.insight), input.source],
  );
  return {
    id: result.lastInsertRowId,
    generatedAt: input.generatedAt,
    payload: input.payload,
    insight: input.insight,
    source: input.source,
  };
}

// The only read the Trends screen actually needs — a running history
// isn't displayed anywhere yet, so no getRecentInsights() until that's
// true (YAGNI; trivial to add later, same shape as every other module's
// getRecentX()).
export async function getLatestInsight(): Promise<InsightRecord | null> {
  const database = getDb();
  const row = await database.getFirstAsync<InsightRow>(`SELECT * FROM insights ORDER BY generated_at DESC LIMIT 1`);
  return row ? fromRow(row) : null;
}
