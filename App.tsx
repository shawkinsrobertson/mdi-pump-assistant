import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppTabBar } from './components/AppTabBar';
import { GlucoseProvider } from './lib/GlucoseContext';
import { registerInsightTask } from './lib/tasks/insightTask';
import { ThemeProvider, useTheme } from './lib/ThemeContext';
import { DashboardScreen } from './screens/DashboardScreen';
import { LogbookScreen } from './screens/LogbookScreen';
import { SettingsNavigator } from './screens/settings/SettingsNavigator';
import { TrendsScreen } from './screens/TrendsScreen';

const Tab = createBottomTabNavigator();

// Split out from App() so it can call useTheme() — the hook needs a
// descendant of ThemeProvider, not the same component that renders the
// provider. Without this, NavigationContainer's own theme (screen/card
// backgrounds shown during transitions, before content mounts) and the
// status bar's icon color stay light-only regardless of the in-app
// Display setting, even though userInterfaceStyle: "automatic" in
// app.json already covers plain OS-level dark mode — this covers the
// case where the app's own setting overrides the system appearance.
function AppNavigator() {
  const { resolvedScheme } = useTheme();
  return (
    <>
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
      <NavigationContainer theme={resolvedScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Tab.Navigator
          screenOptions={{ headerShown: false }}
          tabBar={(props) => <AppTabBar {...props} />}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen name="Logbook" component={LogbookScreen} />
          <Tab.Screen name="Trends" component={TrendsScreen} />
          <Tab.Screen name="Settings" component={SettingsNavigator} />
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  useEffect(() => {
    registerInsightTask().catch((e) => console.error('Failed to register background insight task:', e));
  }, []);

  return (
    <ThemeProvider>
      <GlucoseProvider>
        <AppNavigator />
      </GlucoseProvider>
    </ThemeProvider>
  );
}
