import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// Clinical values ship null/required rather than a "typical" default
// (AGENTS.md: "never invent clinical defaults" — the user must enter
// their own ISF/ICR/target/DIA). penIncrement is a UX rounding
// convenience, not a clinical parameter, so it gets a real default.
export interface Settings {
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
}

export const DEFAULT_SETTINGS: Settings = {
  isf: null,
  carbRatio: null,
  targetBG: null,
  dia: null,
  penIncrement: 1,
  maxIOB: null,
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
