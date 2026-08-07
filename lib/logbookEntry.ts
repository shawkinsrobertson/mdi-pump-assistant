import type { ActivityRecord } from './db/activities';
import type { BasalDoseRecord } from './db/basalDoses';
import type { NoteEntryRecord } from './db/noteEntries';
import type { Treatment } from './db/treatments';
import type { GlucoseReading } from './glucose';

// Shared between LogbookScreen and LogbookEntryModal — a Logbook row is
// a bolus/correction treatment, a basal (long-acting) dose, a logged
// activity, a standalone note, or a Bluetooth meter reading. The
// 'glucose' kind is deliberately scoped to discrete meter readings
// (source: 'ble') rather than every persisted glucose_readings row — a
// continuous CGM feed logs far too often to read as a Logbook entry the
// way a bolus or note does.
export type LogEntry =
  | { kind: 'treatment'; treatment: Treatment }
  | { kind: 'basal'; dose: BasalDoseRecord }
  | { kind: 'activity'; activity: ActivityRecord }
  | { kind: 'note'; note: NoteEntryRecord }
  | { kind: 'glucose'; reading: GlucoseReading };

export function logEntryId(entry: LogEntry): string {
  switch (entry.kind) {
    case 'treatment':
      return `treatment:${entry.treatment.id}`;
    case 'basal':
      return `basal:${entry.dose.id}`;
    case 'activity':
      return `activity:${entry.activity.id}`;
    case 'note':
      return `note:${entry.note.id}`;
    case 'glucose':
      return `glucose:${entry.reading._id}`;
  }
}

export function logEntryTime(entry: LogEntry): string {
  switch (entry.kind) {
    case 'treatment':
      return entry.treatment.createdAt;
    case 'basal':
      return entry.dose.injectedAt;
    case 'activity':
      return entry.activity.loggedAt;
    case 'note':
      return entry.note.loggedAt;
    case 'glucose':
      return entry.reading.dateString;
  }
}
