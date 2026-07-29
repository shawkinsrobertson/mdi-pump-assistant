import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { cardShadow, colors, radius, spacing } from '../../lib/theme';

// White + drop-shadow card, replacing the earlier flat gray-fill card
// style — see the Dashboard reading card in the revised Figma design.
export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.primary,
    borderRadius: radius.lg,
    padding: spacing.base,
    ...cardShadow,
  },
});
