import { Platform, type ViewStyle } from 'react-native';

// Central design tokens for the app — mirrors the Figma variable
// collections (Primitives/Color/Spacing/Radius) built during the design
// system work. Keep these two in sync by hand; there's no live Code
// Connect binding (Figma Code Connect needs an Org/Enterprise plan we
// don't have — see AGENTS.md).
//
// Two palettes (light/dark) rather than one static `colors` export —
// see lib/ThemeContext.tsx for how a screen actually consumes these via
// useTheme(). Only Settings (and its new sub-screens) consume the
// resolved theme so far; Dashboard/Logbook/Trends still import the
// static `colors` below (== lightColors) and haven't been wired into
// dark mode yet — tracked as follow-up, not forgotten.
export interface ThemeColors {
  brand: string;
  bg: { primary: string; surface: string };
  border: { default: string; subtle: string; muted: string };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    quaternary: string;
    label: string;
    placeholder: string;
    inverse: string;
  };
  status: { success: string; successStrong: string; danger: string; warning: string };
  accent: { info: string };
  action: { primaryBg: string; secondaryBg: string };
}

export const lightColors: ThemeColors = {
  brand: '#054AE1', // favicon / splash icon blue — Figma style "brand/primary"
  bg: {
    primary: '#FFFFFF',
    surface: '#F7F7F7',
  },
  border: {
    default: '#DDDDDD',
    subtle: '#EEEEEE',
    muted: '#E5E5E5',
  },
  text: {
    primary: '#111111',
    secondary: '#555555',
    tertiary: '#888888',
    quaternary: '#999999',
    label: '#333333',
    placeholder: '#BBBBBB',
    inverse: '#FFFFFF',
  },
  status: {
    success: '#16A34A',
    successStrong: '#166534',
    danger: '#DC2626',
    warning: '#D97706',
  },
  accent: {
    info: '#1E3A8A',
  },
  action: {
    primaryBg: '#111111',
    secondaryBg: '#888888',
  },
};

export const darkColors: ThemeColors = {
  brand: '#4C8DFF',
  bg: {
    primary: '#1C1C1E',
    surface: '#000000',
  },
  border: {
    default: '#3A3A3C',
    subtle: '#2C2C2E',
    muted: '#242426',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#C7C7CC',
    tertiary: '#8E8E93',
    quaternary: '#636366',
    label: '#E5E5EA',
    placeholder: '#6E6E73',
    inverse: '#FFFFFF',
  },
  status: {
    success: '#32D74B',
    successStrong: '#248A3D',
    danger: '#FF453A',
    warning: '#FF9F0A',
  },
  accent: {
    info: '#5E9CFF',
  },
  action: {
    primaryBg: '#2C2C2E',
    secondaryBg: '#48484A',
  },
};

// Back-compat default export for screens not yet migrated to useTheme().
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  smMd: 10,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  full: 999,
} as const;

// Icon size scale (xs–xl) — matches the Figma "icon size scale" component.
// Figma only labeled the steps, not pixel values, so these are a judgment
// call; adjust if the on-device look doesn't match intent.
export const iconSize = {
  xs: 14,
  sm: 18,
  md: 22,
  base: 26,
  lg: 32,
  xl: 40,
} as const;

// Quick Action marker styles — one per logged-action type, shared
// between each Quick Action button's icon color and its glucose-chart
// timeline marker shape, so the two stay visually coherent per the
// design spec ("quick action button icons should be updated with
// corresponding colored shape"). Same in both themes — all mid-
// saturation accent colors read fine on either background.
export type MarkerShape = 'circle' | 'diamond' | 'triangle' | 'square';

export const quickActionStyles: Record<'carbs' | 'insulin' | 'activity' | 'note', { color: string; shape: MarkerShape }> = {
  carbs: { color: '#F59E0B', shape: 'circle' },
  insulin: { color: '#054AE1', shape: 'diamond' },
  activity: { color: '#7C3AED', shape: 'triangle' },
  note: { color: '#6B7280', shape: 'square' },
};

// White-card-with-shadow look used on the Dashboard reading card —
// requested for Settings/Trends too, replacing the flat gray-fill card.
export const cardShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  android: {
    elevation: 3,
  },
  default: {},
}) as ViewStyle;

// Font size scale multipliers for the Display and Theme setting.
export type FontSizePreference = 'small' | 'medium' | 'large';
export const FONT_SCALE: Record<FontSizePreference, number> = {
  small: 0.9,
  medium: 1,
  large: 1.15,
};
