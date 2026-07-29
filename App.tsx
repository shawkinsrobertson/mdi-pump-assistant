import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { AppTabBar } from './components/AppTabBar';
import { GlucoseProvider } from './lib/GlucoseContext';
import { registerInsightTask } from './lib/tasks/insightTask';
import { ThemeProvider } from './lib/ThemeContext';
import { DashboardScreen } from './screens/DashboardScreen';
import { LogbookScreen } from './screens/LogbookScreen';
import { SettingsNavigator } from './screens/settings/SettingsNavigator';
import { TrendsScreen } from './screens/TrendsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  useEffect(() => {
    registerInsightTask().catch((e) => console.error('Failed to register background insight task:', e));
  }, []);

  return (
    <ThemeProvider>
      <GlucoseProvider>
        <NavigationContainer>
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
      </GlucoseProvider>
    </ThemeProvider>
  );
}
