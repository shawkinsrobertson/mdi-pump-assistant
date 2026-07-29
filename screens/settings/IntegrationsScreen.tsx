import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { useSettings } from '../../lib/settings';
import { SettingsField } from './SettingsField';
import { useSettingsStyles } from './useSettingsStyles';

const PLANNED = ['Continuous glucose monitors', 'Glucose meters', 'Health Connect', 'Smart pens'];

// Direct device integrations are still "coming soon" (see PLANNED below),
// but this screen now also hosts the one integration that IS real: the
// AI Insights webhook URL, consumed by lib/tasks/insightTask.ts.
export function IntegrationsScreen() {
  const [settings, updateSettings, loaded] = useSettings();
  const styles = useSettingsStyles();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    setWebhookUrl(settings.insightsWebhookUrl ?? '');
  }, [loaded, settings]);

  const handleSave = () => {
    updateSettings({ ...settings, insightsWebhookUrl: webhookUrl.trim() || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Integrations</Text>
        {saved && <Text style={styles.confirmed}>Saved ✓</Text>}
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>AI Insights</Text>
        <Text style={styles.hint}>
          Weekly (and on-demand from Trends &gt; Generate Insights Now), the app sends a summary of your recent
          glucose/treatment data to this endpoint and stores whatever it sends back. Leave blank to disable —
          nothing is sent anywhere without a URL configured here.
        </Text>
        <SettingsField
          label="Webhook URL"
          value={webhookUrl}
          onChangeText={setWebhookUrl}
          keyboardType="url"
          placeholder="https://…"
          last
        />
      </Card>

      <Pressable style={styles.button} onPress={handleSave}>
        <Text style={styles.buttonText}>Save</Text>
      </Pressable>

      <Card style={[styles.card, { marginTop: 16 }]}>
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
