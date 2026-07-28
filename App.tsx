import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GlucoseProvider } from './lib/GlucoseContext';
import { DashboardScreen } from './screens/DashboardScreen';
import { LogbookScreen } from './screens/LogbookScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TrendsScreen } from './screens/TrendsScreen';

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: 'water-outline',
  Logbook: 'list-outline',
  Trends: 'trending-up-outline',
  Settings: 'person-circle-outline',
};

export default function App() {
  return (
    <GlucoseProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />
            ),
            tabBarActiveTintColor: '#2563eb',
            tabBarInactiveTintColor: '#888',
          })}
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
