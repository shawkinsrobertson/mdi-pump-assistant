import { ScrollView, Text } from 'react-native';
import { Card } from '../../components/ui/Card';
import { useSettingsStyles } from './useSettingsStyles';

// Placeholder — content (how to use the app, troubleshooting common
// problems) still needs to be written.
export function TutorialsHelpScreen() {
  const styles = useSettingsStyles();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Coming soon</Text>
        <Text style={styles.hint}>
          Tutorials and troubleshooting content hasn't been written yet.
        </Text>
      </Card>
    </ScrollView>
  );
}
