import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';

// Shared style set for the 6 Settings category screens (Integrations,
// Account and Profile, etc.) — NOT SettingsHomeScreen, which has its own
// local styles (see that file's comment on paddingTop for why). These 6
// screens all render under a real react-navigation native-stack header
// (see SettingsNavigator.tsx — only SettingsHome sets `headerShown:
// false`), which already reserves the correct safe-area space above
// its content on both iOS and Android — adding another top-inset here
// on top of that would double-pad them. Theme-aware (rebuilds when
// colors/font scale change), unlike the rest of the app which still
// uses the static lib/theme.ts export (see AGENTS.md — dark mode is
// applied to Settings first).
export function useSettingsStyles() {
  const { colors, spacing, radius, fontScale } = useTheme();

  return useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.bg.surface,
        },
        content: {
          padding: spacing.xl,
          paddingTop: 24,
          paddingBottom: 120,
        },
        headerRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: spacing.base,
        },
        title: {
          fontSize: 22 * fontScale,
          fontWeight: '700',
          color: colors.text.primary,
        },
        confirmed: {
          color: colors.status.success,
          fontWeight: '600',
          fontSize: 15 * fontScale,
        },
        card: {
          marginBottom: spacing.base,
        },
        cardTitle: {
          fontSize: 16 * fontScale,
          fontWeight: '700',
          color: colors.text.primary,
          marginBottom: spacing.xs,
        },
        hint: {
          fontSize: 13 * fontScale,
          color: colors.text.tertiary,
          marginBottom: spacing.base,
        },
        field: {
          marginBottom: spacing.base,
        },
        fieldLast: {
          marginBottom: 0,
        },
        label: {
          fontSize: 14 * fontScale,
          fontWeight: '600',
          color: colors.text.label,
          marginBottom: spacing.xs,
        },
        input: {
          borderWidth: 1,
          borderColor: colors.border.default,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.smMd,
          fontSize: 16 * fontScale,
          color: colors.text.primary,
        },
        button: {
          backgroundColor: colors.action.primaryBg,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          alignItems: 'center',
        },
        buttonSecondary: {
          backgroundColor: colors.action.secondaryBg,
        },
        buttonDisabled: {
          opacity: 0.6,
        },
        buttonText: {
          color: colors.text.inverse,
          fontWeight: '600',
          fontSize: 15 * fontScale,
        },
        toggleRow: {
          flexDirection: 'row',
          gap: spacing.sm,
        },
        toggleButton: {
          flex: 1,
          borderWidth: 1,
          borderColor: colors.border.default,
          borderRadius: radius.md,
          paddingVertical: 10,
          alignItems: 'center',
          backgroundColor: colors.bg.primary,
        },
        toggleButtonActive: {
          borderColor: colors.action.primaryBg,
          backgroundColor: colors.action.primaryBg,
        },
        toggleText: {
          color: colors.text.secondary,
          fontWeight: '600',
          fontSize: 14 * fontScale,
        },
        toggleTextActive: {
          color: colors.text.inverse,
        },
        rowBetween: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
      }),
    [colors, spacing, radius, fontScale],
  );
}
