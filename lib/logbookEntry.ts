import type { ActivityRecord } from './db/activities';
import type { BasalDoseRecord } from './db/basalDoses';
import type { NoteEntryRecord } from './db/noteEntries';
import type { Treatment } from './db/treatments';

// Shared between LogbookScreen and LogbookEntryModal — a Logbook row is
// a bolus/correction treatment, a basal (long-acting) dose, a logged
// activity, or a standalone note.
export type LogEntry =
  | { kind: 'treatment'; treatment: Treatment }
  | { kind: 'basal'; dose: BasalDoseRecord }
  | { kind: 'activity'; activity: ActivityRecord }
  | { kind: 'note'; note: NoteEntryRecord };

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
  }
}
