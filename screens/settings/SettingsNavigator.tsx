import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../../lib/ThemeContext';
import { AccountProfileScreen } from './AccountProfileScreen';
import { DataSharingScreen } from './DataSharingScreen';
import { DisplayThemeScreen } from './DisplayThemeScreen';
import { IntegrationsScreen } from './IntegrationsScreen';
import { NotificationsScreen } from './NotificationsScreen';
import { SettingsHomeScreen } from './SettingsHomeScreen';
import { TutorialsHelpScreen } from './TutorialsHelpScreen';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Integrations: undefined;
  AccountProfile: undefined;
  DisplayTheme: undefined;
  Notifications: undefined;
  DataSharing: undefined;
  TutorialsHelp: undefined;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

// Settings is a nested stack (rather than a flat tab screen) so each of
// the 6 categories gets its own screen with a real back button — the
// category list itself hides the native header (it draws its own
// "Settings" title, matching Dashboard/Logbook/Trends), while every
// sub-screen uses the stack's built-in header for back navigation
// (Phase F's "all secondary screens need back navigation").
export function SettingsNavigator() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg.primary },
        headerTintColor: colors.text.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="SettingsHome" component={SettingsHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Integrations" component={IntegrationsScreen} options={{ title: 'Integrations' }} />
      <Stack.Screen name="AccountProfile" component={AccountProfileScreen} options={{ title: 'Account and Profile' }} />
      <Stack.Screen name="DisplayTheme" component={DisplayThemeScreen} options={{ title: 'Display and Theme' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications and Reminders' }} />
      <Stack.Screen name="DataSharing" component={DataSharingScreen} options={{ title: 'Data and Sharing' }} />
      <Stack.Screen name="TutorialsHelp" component={TutorialsHelpScreen} options={{ title: 'Tutorials and Help' }} />
    </Stack.Navigator>
  );
}
