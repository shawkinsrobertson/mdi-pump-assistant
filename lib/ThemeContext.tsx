import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  darkColors,
  FONT_SCALE,
  lightColors,
  spacing,
  radius,
  iconSize,
  type FontSizePreference,
  type ThemeColors,
} from './theme';

export type ThemeMode = 'light' | 'dark' | 'system';
export type TimeFormat = '12h' | '24h';

export interface DisplaySettings {
  mode: ThemeMode;
  fontSize: FontSizePreference;
  timeFormat: TimeFormat;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  mode: 'system',
  fontSize: 'medium',
  timeFormat: '12h',
};

const STORAGE_KEY = 'app-display-settings';

async function readDisplaySettings(): Promise<DisplaySettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DISPLAY_SETTINGS;
    return { ...DEFAULT_DISPLAY_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

async function writeDisplaySettings(next: DisplaySettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

interface ThemeContextValue {
  display: DisplaySettings;
  displayLoaded: boolean;
  updateDisplay: (next: DisplaySettings) => void;
  resolvedScheme: 'light' | 'dark';
  colors: ThemeColors;
  fontScale: number;
  spacing: typeof spacing;
  radius: typeof radius;
  iconSize: typeof iconSize;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Persisted app-wide display preferences (theme mode, font size, time
// format) — the "Display and Theme" Settings category. Only Settings
// itself consumes this fully today; Dashboard/Logbook/Trends still use
// lib/theme.ts's static `colors` export and haven't been migrated to
// dark mode yet (tracked as follow-up work, see AGENTS.md).
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [display, setDisplay] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  const [displayLoaded, setDisplayLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readDisplaySettings().then((s) => {
      if (cancelled) return;
      setDisplay(s);
      setDisplayLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateDisplay = useCallback((next: DisplaySettings) => {
    setDisplay(next);
    writeDisplaySettings(next);
  }, []);

  const resolvedScheme: 'light' | 'dark' =
    display.mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : display.mode;

  const value = useMemo<ThemeContextValue>(
    () => ({
      display,
      displayLoaded,
      updateDisplay,
      resolvedScheme,
      colors: resolvedScheme === 'dark' ? darkColors : lightColors,
      fontScale: FONT_SCALE[display.fontSize],
      spacing,
      radius,
      iconSize,
    }),
    [display, displayLoaded, updateDisplay, resolvedScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() must be used within a ThemeProvider');
  return ctx;
}
