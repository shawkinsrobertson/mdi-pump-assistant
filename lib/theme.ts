import { Platform, type ViewStyle } from 'react-native';

// Central design tokens for the app — mirrors the Figma variable
// collections (Primitives/Color/Spacing/Radius) built during the design
// system work. Keep these two in sync by hand; there's no live Code
// Connect binding (Figma Code Connect needs an Org/Enterprise plan we
// don't have — see AGENTS.md).
//
// Two palettes (light/dark) rather than one static `colors` export —
// see lib/ThemeContext.tsx for how a screen actually consumes these via
// useTheme(). Every screen/component now consumes the resolved theme via
// useTheme() (or receives it as a prop, for plain components like
// GlucoseChart/AgpChart/Card that sit below screens) — the `colors`
// export below is kept only as a legacy default for anything that still
// imports it directly, not as an intentionally-unthemed code path.
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
  // GlucoseChart/AgpChart's own subtle gridline + axis-label tones. Kept
  // theme-specific rather than reusing `border`/`text` tokens directly:
  // the light-mode grid is deliberately near-invisible against white
  // (contrast ~1.5:1, by design), and reusing that same hex against a
  // near-black dark background would read as a bright, glaring line
  // instead of a subtle one — see AGENTS.md on contrast regressions
  // introduced by carrying a light-mode value into dark mode unchanged.
  chart: { grid: string; muted: string };
  // Quick Action icon/label + glucose-chart marker color per action type.
  // Verified >=4.5:1 against this theme's own card background (see the
  // dark-mode contrast audit — the light-mode carbs amber and several
  // dark-mode colors originally failed WCAG AA before this split).
  quickAction: { carbs: string; insulin: string; activity: string; note: string };
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
  chart: {
    grid: '#D1D5DB',
    muted: '#6B7280',
  },
  quickAction: {
    // Original #F59E0B measured ~2.15:1 against a white card — fails even
    // the 3:1 graphical-object minimum, let alone 4.5:1 for the label
    // text underneath. Darkened to the same hue at ~4.6:1.
    carbs: '#AE6209',
    insulin: '#054AE1',
    activity: '#7C3AED',
    note: '#6B7280',
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
  chart: {
    // Matches the light theme's grid contrast (~1.5:1) against its own
    // background instead of reusing the light-mode hex, which would
    // measure ~11.5:1 here — a glaring line rather than a subtle one.
    grid: '#3A3A3C',
    muted: '#8E8E93',
  },
  quickAction: {
    carbs: '#F59E0B',
    // Original #054AE1 (the light-mode brand blue) measured ~2.49:1
    // against a dark card — reused darkColors.brand instead, which was
    // already tuned for this exact background (~5.3:1).
    insulin: '#4C8DFF',
    // Original #7C3AED measured ~2.99:1 against a dark card, just under
    // the 3:1 graphical minimum. Lightened to ~4.55:1.
    activity: '#A067E9',
    // Original #6B7280 measured ~3.52:1 against a dark card — enough for
    // a graphical marker but not the 4.5:1 the same color needs as the
    // label text underneath it. Lightened to ~4.6:1.
    note: '#858585',
  },
};

// rgba() with a hex color's own RGB channels — used to derive a
// translucent variant of a theme color (chart bands, badges) instead of
// hand-picking a separate rgba() literal that would drift out of sync
// with the base color across theme changes.
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
// corresponding colored shape"). The shape is fixed per action
// regardless of theme; the color comes from ThemeColors.quickAction
// (see lightColors/darkColors above) since a single mid-saturation hex
// does NOT read at an accessible contrast on both a white and a
// near-black background — verified against WCAG 4.5:1 per theme.
export type QuickActionType = 'carbs' | 'insulin' | 'activity' | 'note';
export type MarkerShape = 'circle' | 'diamond' | 'triangle' | 'square';

const QUICK_ACTION_SHAPES: Record<QuickActionType, MarkerShape> = {
  carbs: 'circle',
  insulin: 'diamond',
  activity: 'triangle',
  note: 'square',
};

export function quickActionStyle(colors: ThemeColors, action: QuickActionType): { color: string; shape: MarkerShape } {
  return { color: colors.quickAction[action], shape: QUICK_ACTION_SHAPES[action] };
}

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
