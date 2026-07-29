import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import type { GlucoseReading } from './glucose';

// New native module (expo-notifications) — needs a full dev-client
// rebuild (npx expo run:android) before this can be tested on-device,
// same category as the earlier BLE/react-native-screens additions.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface NotificationSettings {
  enabled: boolean;
  lowThreshold: number;
  highThreshold: number;
  dndEnabled: boolean;
  dndStart: string; // "HH:MM", 24h
  dndEnd: string; // "HH:MM", 24h, may wrap past midnight (e.g. 22:00 -> 07:00)
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  lowThreshold: 70,
  highThreshold: 180,
  dndEnabled: false,
  dndStart: '22:00',
  dndEnd: '07:00',
};

const STORAGE_KEY = 'app-notification-settings';

export async function readNotificationSettings(): Promise<NotificationSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

const listeners = new Set<(settings: NotificationSettings) => void>();

export async function writeNotificationSettings(next: NotificationSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  for (const listener of listeners) listener(next);
}

export function useNotificationSettings(): [NotificationSettings, (next: NotificationSettings) => void, boolean] {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readNotificationSettings().then((s) => {
      if (cancelled) return;
      setSettings(s);
      setLoaded(true);
    });
    listeners.add(setSettings);
    return () => {
      cancelled = true;
      listeners.delete(setSettings);
    };
  }, []);

  const update = useCallback((next: NotificationSettings) => {
    setSettings(next);
    writeNotificationSettings(next);
  }, []);

  return [settings, update, loaded];
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

// "HH:MM" -> minutes since midnight, for DND window comparison.
function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function isWithinDnd(settings: NotificationSettings, now: Date): boolean {
  if (!settings.dndEnabled) return false;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const start = minutesOfDay(settings.dndStart);
  const end = minutesOfDay(settings.dndEnd);
  if (start === end) return false; // a zero-length window means "off"
  if (start < end) {
    return nowMinutes >= start && nowMinutes < end;
  }
  // wraps past midnight (e.g. 22:00 -> 07:00)
  return nowMinutes >= start || nowMinutes < end;
}

// Cooldown so a glucose value sitting just past a threshold doesn't fire
// a notification on every single poll — re-alerts only after the value
// crosses back to normal and out again, or after this much time passes.
const RENOTIFY_COOLDOWN_MS = 20 * 60 * 1000;
let lastNotifiedZone: 'low' | 'high' | 'in-range' | null = null;
let lastNotifiedAt = 0;

function currentZone(sgv: number, settings: NotificationSettings): 'low' | 'high' | 'in-range' {
  if (sgv < settings.lowThreshold) return 'low';
  if (sgv > settings.highThreshold) return 'high';
  return 'in-range';
}

// Call with every new glucose reading (see GlucoseContext). Fires a
// local notification when BG crosses outside the user's thresholds,
// respecting DND and a re-notify cooldown — never on every single poll.
export async function checkGlucoseAndNotify(reading: GlucoseReading, settings: NotificationSettings): Promise<void> {
  if (!settings.enabled) return;
  const now = new Date();
  if (isWithinDnd(settings, now)) return;

  const zone = currentZone(reading.sgv, settings);
  if (zone === 'in-range') {
    lastNotifiedZone = 'in-range';
    return;
  }

  const sameZoneRecently = zone === lastNotifiedZone && Date.now() - lastNotifiedAt < RENOTIFY_COOLDOWN_MS;
  if (sameZoneRecently) return;

  lastNotifiedZone = zone;
  lastNotifiedAt = Date.now();

  const title = zone === 'low' ? 'Glucose is low' : 'Glucose is high';
  const body =
    zone === 'low'
      ? `${reading.sgv} mg/dL — below your ${settings.lowThreshold} mg/dL threshold.`
      : `${reading.sgv} mg/dL — above your ${settings.highThreshold} mg/dL threshold.`;

  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch (e) {
    console.error('Failed to schedule glucose notification:', e);
  }
}
