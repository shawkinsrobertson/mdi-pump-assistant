// Parses raw Nightscout-format JSON exports (entries.json / treatments.json
// — the same shape AAPS, xDrip+, and Nightscout itself all produce) into
// this app's own record shapes. Built as a one-off testing aid to seed
// the local DB with real historical data rather than synthetic fixtures —
// NOT the v1 import feature (that's deliberately deferred; v1 targets MDI
// users without this kind of "fancy" migration tooling). See
// scripts/seed-data/ and the temporary seed button in SettingsScreen.
import type { EventType, NewTreatment } from '../db/treatments';
import type { GlucoseReading } from '../glucose';

interface RawNightscoutEntry {
  _id?: string;
  identifier?: string;
  date?: number;
  sgv?: number;
  direction?: string;
  noise?: number;
  created_at?: string;
}

// Only sgv-type entries carry a glucose value — Nightscout's entries
// collection also holds calibration/meter-bg records we don't want here.
export function parseNightscoutEntries(raw: unknown): GlucoseReading[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawNightscoutEntry[])
    .filter((r) => typeof r.sgv === 'number' && typeof r.date === 'number' && typeof r.created_at === 'string')
    .map((r) => ({
      sgv: r.sgv!,
      date: r.date!,
      // Nightscout's created_at is the ISO-string equivalent of `date` —
      // xDrip+'s own sgv.json (this field's other source, see lib/glucose.ts)
      // calls the same thing dateString.
      dateString: r.created_at!,
      // Nightscout doesn't ship a precomputed delta on each entry (unlike
      // xDrip+'s sgv.json) — not critical, since nothing in this app's
      // IOB/COB/oref0 math reads GlucoseReading.delta; only direction and
      // sgv itself matter there (see lib/glucose.ts, lib/oref/predictionCore.ts).
      delta: 0,
      direction: r.direction ?? 'NOT COMPUTABLE',
      noise: r.noise ?? 0,
      _id: r._id ?? r.identifier ?? `${r.date}`,
    }));
}

interface RawNightscoutTreatment {
  eventType?: string;
  insulin?: number | null;
  carbs?: number | null;
  created_at?: string;
}

// Only these event types map onto this app's schema — Nightscout's
// treatments collection also carries "Temp Basal" (pump-only, no MDI
// equivalent and not something this schema models at all — see
// lib/db/treatments.ts) and administrative "Note" entries, both skipped.
const IMPORTABLE_EVENT_TYPES = new Set<EventType>(['Meal Bolus', 'Correction Bolus']);

export function parseNightscoutTreatments(raw: unknown): NewTreatment[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawNightscoutTreatment[])
    .filter(
      (r): r is RawNightscoutTreatment & { eventType: EventType; created_at: string } =>
        typeof r.created_at === 'string' &&
        IMPORTABLE_EVENT_TYPES.has(r.eventType as EventType) &&
        (r.insulin != null || r.carbs != null),
    )
    .map((r) => ({
      eventType: r.eventType,
      insulin: r.insulin ?? null,
      carbs: r.carbs ?? null,
      createdAt: r.created_at,
    }));
}
