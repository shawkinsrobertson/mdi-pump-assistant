import { ScrollView, Text } from 'react-native';
import { Card } from '../../components/ui/Card';
import { useSettingsStyles } from './useSettingsStyles';

const PLANNED = ['Continuous glucose monitors', 'Glucose meters', 'Health Connect', 'Smart pens'];

// Placeholder category — explicitly "coming soon" per the spec.
export function IntegrationsScreen() {
  const styles = useSettingsStyles();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Coming soon</Text>
        <Text style={styles.hint}>
          Direct integrations are planned but not yet built. For now, use Logbook &gt; Connect meter for Bluetooth
          glucose meters, and the xDrip+ connection already configured on the Dashboard.
        </Text>
        {PLANNED.map((item) => (
          <Text key={item} style={[styles.hint, { marginBottom: 4 }]}>
            • {item}
          </Text>
        ))}
      </Card>
    </ScrollView>
  );
}
