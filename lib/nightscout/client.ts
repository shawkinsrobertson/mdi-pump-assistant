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

// createdAt is re-serialized through Date.parse()/toISOString(), not
// passed through as-received — Nightscout's created_at format isn't
// consistent across uploaders (AndroidAPS/Loop/xDrip+/etc. don't all
// serialize timestamps identically: some omit milliseconds, some use a
// numeric timezone offset instead of "Z"). Storing a canonical format
// here keeps every date comparison downstream (lib/db/nightscoutTreatments.ts)
// working regardless of what this particular server/uploader sent — see
// that file for the on-device bug this was found from. A treatment whose
// created_at doesn't parse to a real date at all is dropped rather than
// stored with a garbage/NaN timestamp.
export function normalizeTreatment(raw: unknown): NightscoutTreatment | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r._id !== 'string' || typeof r.created_at !== 'string') return null;
  const createdAtMs = Date.parse(r.created_at);
  if (!Number.isFinite(createdAtMs)) return null;
  return {
    id: r._id,
    eventType: typeof r.eventType === 'string' ? r.eventType : null,
    insulin: typeof r.insulin === 'number' ? r.insulin : null,
    carbs: typeof r.carbs === 'number' ? r.carbs : null,
    createdAt: new Date(createdAtMs).toISOString(),
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
//
// Nightscout's REST API sorts matching documents newest-first by default
// (no explicit sort param) and `count` caps the *result set size*, not a
// pagination cursor — a single request against a wide window (e.g. this
// app's 7-day FIRST_SYNC_LOOKBACK_MS in lib/nightscout/sync.ts) silently
// returns only the newest `count` matches and drops everything older
// within that window. Confirmed on-device: a real closed-loop uploader
// (AndroidAPS/Loop) posts a Temp Basal adjustment roughly every 5 minutes
// — ~2000 potential matches over 7 days vs. the 200 default — so a first
// sync came back with treatments from today only, and "synced 200
// treatments" lined up exactly with the `count` default. That's the same
// row-count-cap-starved-by-Temp-Basal-noise bug class as the Logbook's own
// display query (see AGENTS.md's `## Status`), just one layer upstream in
// the actual fetch from the Nightscout server.
//
// Fixed with cursor-based backward pagination: each page is bounded above
// by `created_at <$lte>` (unset on the first page, so it starts from
// "now"), and the oldest `created_at` seen in a page becomes the next
// page's `$lte` cursor. Pagination stops once a page comes back with fewer
// than `count` records (the `$gte..$lte` window is exhausted) or empty.
// `lib/ble/racp.ts` is this app's other paginated remote fetch, but its
// ascending-sequence-number protocol doesn't transfer here — Nightscout's
// REST API gives no reliable ascending-sort guarantee to page forward by,
// hence paging backward from "now" instead.
//
// The cursor is INCLUSIVE (not `oldestMs - 1ms`) specifically to handle
// several treatments sharing the exact same `created_at` (realistic: some
// uploaders omit milliseconds, and a closed-loop system can batch-upload
// several entries within the same second). An exclusive cursor would
// silently and permanently drop any tied record that didn't make it into
// the page before the `count` cutoff split the tie — the next page's
// `$lte` would exclude that timestamp entirely, so it's never re-fetched.
// Re-including the boundary value and relying on `seenIds` to dedupe
// across pages instead recovers those stragglers. If a full page comes
// back with zero records not already in `seenIds`, every record at this
// exact boundary has already been captured (or there are more ties at one
// timestamp than fit in a single page, which no secondary sort key exists
// to page through) — either way, re-fetching the same cursor again would
// make no further progress, so pagination stops rather than looping.
export async function fetchNightscoutTreatments(
  baseUrl: string,
  token: string,
  sinceIso: string,
  count = 200,
): Promise<NightscoutTreatment[]> {
  // Hard cap on pages so a pathological server response (one that never
  // returns a short/empty page) can't loop forever — same defensive-cap
  // reasoning as lib/db/nightscoutTreatments.ts's pruneOldTreatments
  // chunking. 50 pages * 200/page = 10,000 records is far beyond what even
  // a worst-case week of closed-loop Temp Basal noise could produce.
  const MAX_PAGES = 50;

  const results: NightscoutTreatment[] = [];
  const seenIds = new Set<string>();
  let cursor: string | null = null; // find[created_at][$lte]; null = no upper bound yet ("now")

  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = {
      count: String(count),
      'find[created_at][$gte]': sinceIso,
    };
    if (cursor !== null) params['find[created_at][$lte]'] = cursor;

    const url = buildUrl(baseUrl, '/api/v1/treatments.json', token, params);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Nightscout treatments request failed: HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error('Unexpected Nightscout treatments response (expected an array)');

    const normalized = data.map(normalizeTreatment).filter((t): t is NightscoutTreatment => t !== null);
    let newCount = 0;
    for (const t of normalized) {
      if (!seenIds.has(t.id)) {
        seenIds.add(t.id);
        results.push(t);
        newCount++;
      }
    }

    if (data.length < count) break; // short (or empty) page — window exhausted
    if (newCount === 0) break; // stuck re-fetching an already-seen tied boundary — see comment above

    const oldestMs = normalized.reduce((min, t) => Math.min(min, Date.parse(t.createdAt)), Infinity);
    if (!Number.isFinite(oldestMs)) break; // nothing with a parseable date left to bound by
    cursor = new Date(oldestMs).toISOString(); // inclusive — see comment above
  }

  return results;
}
