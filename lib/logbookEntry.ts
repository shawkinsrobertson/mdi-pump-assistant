import type { BasalDoseRecord } from './db/basalDoses';
import type { Treatment } from './db/treatments';

// Shared between LogbookScreen and LogbookEntryModal — a Logbook row is
// either a bolus/correction treatment or a basal (long-acting) dose.
export type LogEntry = { kind: 'treatment'; treatment: Treatment } | { kind: 'basal'; dose: BasalDoseRecord };

export function logEntryId(entry: LogEntry): string {
  return `${entry.kind}:${entry.kind === 'treatment' ? entry.treatment.id : entry.dose.id}`;
}

export function logEntryTime(entry: LogEntry): string {
  return entry.kind === 'treatment' ? entry.treatment.createdAt : entry.dose.injectedAt;
}
