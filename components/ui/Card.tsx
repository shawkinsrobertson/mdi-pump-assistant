import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { cardShadow } from '../../lib/theme';

// White(light)/dark-surface + drop-shadow card, replacing the earlier flat
// gray-fill card style — see the Dashboard reading card in the revised
// Figma design. Used everywhere a themed card surface is needed, so this
// is the highest-leverage place to be theme-aware: every screen that
// renders a <Card> gets dark mode for free once this does.
export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors, radius, spacing } = useTheme();
  const styles = makeStyles(colors, radius, spacing);
  return <View style={[styles.card, style]}>{children}</View>;
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  radius: ReturnType<typeof useTheme>['radius'],
  spacing: ReturnType<typeof useTheme>['spacing'],
) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.bg.primary,
      borderRadius: radius.lg,
      padding: spacing.base,
      ...cardShadow,
    },
  });
}
