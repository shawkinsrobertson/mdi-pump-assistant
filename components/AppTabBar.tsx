import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cardShadow, colors, iconSize, radius, spacing } from '../lib/theme';

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: 'water',
  Logbook: 'list',
  Trends: 'calendar',
  Settings: 'person-circle',
};
const TAB_ICONS_OUTLINE: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: 'water-outline',
  Logbook: 'list-outline',
  Trends: 'calendar-outline',
  Settings: 'person-circle-outline',
};

// Floating pill tab bar replacing the earlier edge-to-edge underlined
// bar — see the revised Figma Dashboard/Logbook designs.
export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + spacing.sm }]}>
      <View style={[styles.pill, cardShadow]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = (options.tabBarLabel ?? options.title ?? route.name) as string;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const iconName = (focused ? TAB_ICONS[route.name] : TAB_ICONS_OUTLINE[route.name]) ?? 'ellipse-outline';
          const color = focused ? colors.brand : colors.text.quaternary;

          return (
            <Pressable key={route.key} onPress={onPress} style={styles.tab} accessibilityRole="button" accessibilityLabel={label}>
              <Ionicons name={iconName} size={iconSize.lg} color={color} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    backgroundColor: colors.bg.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
