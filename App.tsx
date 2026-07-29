import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AppTabBar } from './components/AppTabBar';
import { GlucoseProvider } from './lib/GlucoseContext';
import { ThemeProvider } from './lib/ThemeContext';
import { DashboardScreen } from './screens/DashboardScreen';
import { LogbookScreen } from './screens/LogbookScreen';
import { SettingsNavigator } from './screens/settings/SettingsNavigator';
import { TrendsScreen } from './screens/TrendsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
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
