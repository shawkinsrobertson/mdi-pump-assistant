import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { LongActingInsulinType } from './mdi/basalCurve';

// A recurring daily basal dosing schedule (Settings > Account and Profile
// > Dosing and Treatment Configuration). Drives lib/tasks/basalReminders.ts's
// local notification scheduling; each reminder still requires a tap-to-
// confirm in the Insulin quick action (Bolus/Basal mode) before anything
// is actually logged — this config never writes a basal_doses row by
// itself. See AGENTS.md for the reasoning against silent auto-logging.
export interface BasalScheduleConfig {
  type: LongActingInsulinType;
  // Only meaningful when type === 'other'.
  customName: string | null;
  customDurationHours: number | null;
  units: number | null;
  times: string[]; // "HH:MM", 24h — one entry per daily dose
}

// Which live CGM feed drives "current BG"/history (lib/GlucoseContext.tsx)
// — deliberately mutually exclusive, not two independent toggles. Both
// paths ultimately mirror the same underlying sensor data in the common
// case (xDrip+ usually uploads to the same Nightscout instance a person
// would point this at), and the glucose_readings dedup key is namespaced
// by source — `${source}:${reading._id}` — so running both at once would
// double-ingest the same curve under two different ids rather than
// merging them. See AGENTS.md for the fuller reasoning.
export type GlucoseSource = 'xdrip' | 'nightscout';

export function glucoseSourceLabel(source: GlucoseSource): string {
  return source === 'nightscout' ? 'Nightscout' : 'xDrip+';
}

// Clinical values ship null/required rather than a "typical" default
// (AGENTS.md: "never invent clinical defaults" — the user must enter
// their own ISF/ICR/target/DIA). penIncrement is a UX rounding
// convenience, not a clinical parameter, so it gets a real default.
export interface Settings {
  // Display-only — used for the Dashboard's "Welcome, {name}" greeting.
  // Not a clinical field, so unlike isf/carbRatio/etc. below it's fine to
  // ship null (falls back to "User") rather than requiring entry.
  name: string | null;
  isf: number | null;
  carbRatio: number | null;
  targetBG: number | null;
  dia: number | null; // hours
  penIncrement: number; // units
  // Max insulin-on-board oref0's determine-basal is allowed to reason
  // about (profile.max_iob) — a personal safety cap, not an algorithm
  // tuning constant, so it ships null/required like the clinical fields
  // above rather than inheriting one of oref0's own defaults.
  maxIOB: number | null;
  // Time in Range display thresholds (Trends screen). Unlike the fields
  // above, this isn't a personal dosing parameter — it's a reporting
  // convention, and 70/180 mg/dL is the published international
  // consensus range (Battelino et al. 2019, adopted by ADA/EASD/ISPAD and
  // used as the default in virtually every CGM report — Dexcom Clarity,
  // LibreView, Nightscout). Shipping that as the default here is using a
  // published external standard, not inventing a clinical value; still
  // user-adjustable since a clinician may specify a different range.
  rangeLow: number;
  rangeHigh: number;
  // Endpoint the weekly background insight task (and the manual "Generate
  // Insights Now" button on Trends) POSTs a structured summary payload
  // to — see lib/tasks/insightTask.ts. No default: without one configured,
  // insight generation is simply skipped rather than posting anywhere.
  insightsWebhookUrl: string | null;
  // No default: nothing is scheduled/reminded until the person sets one
  // up themselves.
  basalSchedule: BasalScheduleConfig | null;
  // Opt-in (Settings > Integrations > Health sync) — off by default, same
  // as insightsWebhookUrl above. See lib/health/sync.ts: read-only pull of
  // steps/activity/nutrition from HealthKit/Health Connect, never written
  // back, never feeding COB/IOB.
  healthSyncEnabled: boolean;
  // ISO 8601, or null before the first successful sync. Drives the
  // "since" window for the next sync (lib/health/sync.ts) and the
  // last-synced display on the Integrations screen.
  healthLastSyncedAt: string | null;
  // Defaults to 'xdrip' — preserves existing behavior for anyone who
  // hasn't configured Nightscout; switching to 'nightscout' requires
  // nightscoutUrl/nightscoutToken to both be set (enforced in the
  // Integrations screen, not here).
  glucoseSource: GlucoseSource;
  // Nightscout connectivity (lib/nightscout/) — a remote Nightscout
  // instance, unlike xDrip+'s device-local server. No default URL/token
  // shipped (unlike the web app's committed source, which hardcoded a
  // live token as a default — deliberately not carried over here; see
  // AGENTS.md).
  nightscoutUrl: string | null;
  nightscoutToken: string | null;
  // Drives the "since" window for the next Nightscout treatments sync
  // (lib/nightscout/sync.ts) — same pattern as healthLastSyncedAt.
  nightscoutLastSyncedAt: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  name: null,
  isf: null,
  carbRatio: null,
  targetBG: null,
  dia: null,
  penIncrement: 1,
  maxIOB: null,
  rangeLow: 70,
  rangeHigh: 180,
  insightsWebhookUrl: null,
  basalSchedule: null,
  healthSyncEnabled: false,
  healthLastSyncedAt: null,
  glucoseSource: 'xdrip',
  nightscoutUrl: null,
  nightscoutToken: null,
  nightscoutLastSyncedAt: null,
};

const STORAGE_KEY = 'app-settings';

export async function readSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Multiple modals (Settings, Quick Log, …) each hold their own
// useSettings() instance; there's no `window` to dispatch a DOM event
// from like the web app used, so a saved change needs its own way to
// reach every other mounted instance — otherwise Quick Log keeps using
// whatever it read on mount even after Settings saves something new.
const listeners = new Set<(settings: Settings) => void>();

export async function writeSettings(next: Settings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  for (const listener of listeners) listener(next);
}

// `loaded` lets callers avoid briefly rendering DEFAULT_SETTINGS (e.g. a
// disabled calculator flashing before the real, saved values arrive).
export function useSettings(): [Settings, (next: Settings) => void, boolean] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readSettings().then((s) => {
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

  const update = useCallback((next: Settings) => {
    setSettings(next);
    writeSettings(next);
  }, []);

  return [settings, update, loaded];
}
