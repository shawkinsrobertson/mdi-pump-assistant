import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import type { SettingsStackParamList } from './SettingsNavigator';

type Props = NativeStackScreenProps<SettingsStackParamList, 'SettingsHome'>;

const CATEGORIES: {
  route: keyof SettingsStackParamList;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}[] = [
  {
    route: 'Integrations',
    icon: 'link-outline',
    title: 'Integrations',
    subtitle: 'Continuous glucose monitors, glucose meters, Health Connect, smart pens',
  },
  {
    route: 'AccountProfile',
    icon: 'person-outline',
    title: 'Account and Profile',
    subtitle: 'Dosing settings, Time in Range, insulins, additional medications',
  },
  {
    route: 'DisplayTheme',
    icon: 'color-palette-outline',
    title: 'Display and Theme',
    subtitle: 'Dark, light, system sync, font size, time settings',
  },
  {
    route: 'Notifications',
    icon: 'notifications-outline',
    title: 'Notifications and Reminders',
    subtitle: 'What you want to be notified/reminded about and when',
  },
  {
    route: 'DataSharing',
    icon: 'share-social-outline',
    title: 'Data and Sharing',
    subtitle: 'Export, delete data, sharing with care providers',
  },
  {
    route: 'TutorialsHelp',
    icon: 'help-circle-outline',
    title: 'Tutorials and Help',
    subtitle: 'How to use this app and troubleshooting common problems',
  },
];

export function SettingsHomeScreen({ navigation }: Props) {
  const { colors, spacing, radius, fontScale } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg.surface }]}
      contentContainerStyle={[styles.content, { padding: spacing.xl, paddingBottom: 120 }]}
    >
      <Text style={[styles.title, { color: colors.text.primary, fontSize: 22 * fontScale, marginBottom: spacing.base }]}>
        Settings
      </Text>

      {CATEGORIES.map((cat) => (
        <Pressable
          key={cat.route}
          onPress={() => navigation.navigate(cat.route as never)}
          style={[
            styles.row,
            {
              backgroundColor: colors.bg.primary,
              borderRadius: radius.lg,
              padding: spacing.base,
              marginBottom: spacing.sm,
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.bg.surface }]}>
            <Ionicons name={cat.icon} size={22} color={colors.brand} />
          </View>
          <View style={styles.textWrap}>
            <Text style={[styles.rowTitle, { color: colors.text.primary, fontSize: 16 * fontScale }]}>{cat.title}</Text>
            <Text style={[styles.rowSubtitle, { color: colors.text.tertiary, fontSize: 13 * fontScale }]}>
              {cat.subtitle}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {},
  title: {
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  rowTitle: {
    fontWeight: '600',
    marginBottom: 2,
  },
  rowSubtitle: {
    lineHeight: 17,
  },
});
