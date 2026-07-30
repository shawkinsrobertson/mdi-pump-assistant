// Schedules local notifications for a configured basal dosing schedule
// (Settings > Account and Profile > Dosing and Treatment Configuration).
// This ONLY reminds — it never writes a basal_doses row itself. Tapping
// the reminder opens the Insulin quick action in Basal mode (see
// DashboardScreen.tsx's notification-response handling), where the
// person still has to review and confirm before anything is logged —
// same tap-to-confirm requirement as every other entry type in this app.
// A silently self-logging schedule would mean the recorded dose (and the
// IOB/basal curve predictions rely on) could drift from what actually
// happened whenever a dose is late, skipped, or split.
import * as Notifications from 'expo-notifications';
import type { BasalScheduleConfig } from '../settings';

// One fixed identifier per schedule slot rather than tracking which IDs
// are currently live — cancelling an identifier that isn't scheduled is a
// harmless no-op, so it's simplest to always cancel this whole range
// before rescheduling. 10 times/day is far beyond any real regimen.
const MAX_SCHEDULE_SLOTS = 10;

function reminderIdentifier(index: number): string {
  return `basal-reminder-${index}`;
}

// So DashboardScreen's notification-response handler can recognize this
// as a basal reminder tap (vs. any other future notification type) — kept
// minimal since the modal reads the live schedule from Settings itself
// rather than trusting a payload that could be stale if the schedule was
// edited after this notification was scheduled.
export const BASAL_REMINDER_DATA_TYPE = 'basal-reminder';

export function basalDisplayName(schedule: BasalScheduleConfig): string {
  if (schedule.type === 'other') return schedule.customName?.trim() || 'basal';
  return schedule.type;
}

export async function cancelAllBasalReminders(): Promise<void> {
  await Promise.all(
    Array.from({ length: MAX_SCHEDULE_SLOTS }, (_, i) => Notifications.cancelScheduledNotificationAsync(reminderIdentifier(i))),
  );
}

// Call whenever the basal schedule is saved (including cleared) —
// cancels whatever was previously scheduled and reschedules from the new
// config. Safe to call with `schedule: null` to just clear everything.
export async function rescheduleBasalReminders(schedule: BasalScheduleConfig | null): Promise<void> {
  await cancelAllBasalReminders();
  if (!schedule || schedule.times.length === 0) return;

  const name = basalDisplayName(schedule);
  const unitsText = schedule.units != null ? `${schedule.units} U` : '';

  await Promise.all(
    schedule.times.slice(0, MAX_SCHEDULE_SLOTS).map((time, i) => {
      const [hour, minute] = time.split(':').map(Number);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Promise.resolve();
      return Notifications.scheduleNotificationAsync({
        identifier: reminderIdentifier(i),
        content: {
          title: 'Basal dose reminder',
          body: `Time for your ${name} dose${unitsText ? ` — ${unitsText}` : ''}. Tap to confirm.`,
          data: { type: BASAL_REMINDER_DATA_TYPE },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
        },
      });
    }),
  );
}
