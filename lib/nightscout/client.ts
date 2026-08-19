// REST client for a remote Nightscout instance — the same
// Nightscout-compatible API xDrip+'s local server already mimics (see
// lib/glucose.ts's GlucoseReading, modeled on that shape from the start),
// just pointed at a real Nightscout host instead of 127.0.0.1. Token-based
// auth via the `?token=` query param (a modern Nightscout read-only role
// token), not the legacy full-access API-SECRET header.
import type { GlucoseReading } from '../glucose';

export interface NightscoutTreatment {
  id: string; // Nightscout's own _id
  eventType: string | null;
  insulin: number | null;
  carbs: number | null;
  createdAt: string; // ISO 8601
  notes: string | null;
}

function buildUrl(baseUrl: string, path: string, token: string, params: Record<string, string>): string {
  const url = new URL(path, baseUrl);
  url.searchParams.set('token', token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

// Defensive parsing, not a trusting cast — this is a network response
// from a server this app doesn't control (the person's own Nightscout
// instance, but still a third party over the wire), unlike xDrip+'s
// tightly-coupled local server. Missing optional fields (delta/direction/
// noise aren't guaranteed present on every Nightscout deployment/plugin
// combination) fall back to the same defaults GlucoseReading already
// treats as "unknown" elsewhere in this codebase, rather than producing
// `NaN`/`undefined` that would silently corrupt downstream math.
export function normalizeEntry(raw: unknown): GlucoseReading | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.sgv !== 'number' || typeof r.date !== 'number' || typeof r._id !== 'string') return null;
  return {
    sgv: r.sgv,
    date: r.date,
    dateString: typeof r.dateString === 'string' ? r.dateString : new Date(r.date).toISOString(),
    delta: typeof r.delta === 'number' ? r.delta : 0,
    direction: typeof r.direction === 'string' ? r.direction : 'None',
    noise: typeof r.noise === 'number' ? r.noise : 0,
    _id: r._id,
  };
}

export function normalizeTreatment(raw: unknown): NightscoutTreatment | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r._id !== 'string' || typeof r.created_at !== 'string') return null;
  return {
    id: r._id,
    eventType: typeof r.eventType === 'string' ? r.eventType : null,
    insulin: typeof r.insulin === 'number' ? r.insulin : null,
    carbs: typeof r.carbs === 'number' ? r.carbs : null,
    createdAt: r.created_at,
    notes: typeof r.notes === 'string' ? r.notes : null,
  };
}

// /api/v1/entries/sgv.json (not the unfiltered /entries.json) — mirrors
// xDrip+'s sgv.json, returning only glucose readings, not the mbg/cal/etc.
// entry types real Nightscout's generic entries endpoint also serves.
export async function fetchNightscoutEntries(baseUrl: string, token: string, count: number): Promise<GlucoseReading[]> {
  const url = buildUrl(baseUrl, '/api/v1/entries/sgv.json', token, { count: String(count) });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Nightscout entries request failed: HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error('Unexpected Nightscout entries response (expected an array)');
  return data.map(normalizeEntry).filter((r): r is GlucoseReading => r !== null);
}

// find[created_at][$gte]=<ISO> — Nightscout's Mongo-query-shaped REST
// filter syntax, not a bespoke "since" param of this app's own invention.
export async function fetchNightscoutTreatments(
  baseUrl: string,
  token: string,
  sinceIso: string,
  count = 200,
): Promise<NightscoutTreatment[]> {
  const url = buildUrl(baseUrl, '/api/v1/treatments.json', token, {
    count: String(count),
    'find[created_at][$gte]': sinceIso,
  });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Nightscout treatments request failed: HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error('Unexpected Nightscout treatments response (expected an array)');
  return data.map(normalizeTreatment).filter((t): t is NightscoutTreatment => t !== null);
}
