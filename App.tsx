import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AppTabBar } from './components/AppTabBar';
import { GlucoseProvider } from './lib/GlucoseContext';
import { DashboardScreen } from './screens/DashboardScreen';
import { LogbookScreen } from './screens/LogbookScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TrendsScreen } from './screens/TrendsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <GlucoseProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{ headerShown: false }}
          tabBar={(props) => <AppTabBar {...props} />}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen name="Logbook" component={LogbookScreen} />
          <Tab.Screen name="Trends" component={TrendsScreen} />
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </GlucoseProvider>
  );
}
