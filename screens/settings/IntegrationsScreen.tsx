import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { isHealthSyncSupported, requestHealthPermissions, syncHealthData } from '../../lib/health/sync';
import { readSettings, useSettings } from '../../lib/settings';
import { useTheme } from '../../lib/ThemeContext';
import { SettingsField } from './SettingsField';
import { useSettingsStyles } from './useSettingsStyles';

const PLANNED = ['Continuous glucose monitors', 'Glucose meters', 'Smart pens', 'Nightscout'];

function formatLastSynced(iso: string | null): string {
  if (!iso) return 'Never synced';
  return `Last synced ${new Date(iso).toLocaleString()}`;
}

// Direct device integrations are still "coming soon" (see PLANNED
// below), but this screen also hosts two real integrations: the AI
// Insights webhook URL (lib/tasks/insightTask.ts) and HealthKit/Health
// Connect sync (lib/health/sync.ts) — steps, activity, and nutrition
// pulled in read-only. Activity/nutrition also get their own Logbook
// rows, and all three feed the AI Insights payload (lib/insights/insightPayload.ts)
// so the model can reference them — but none of it ever reaches oref0's
// COB/IOB math (see AGENTS.md).
export function IntegrationsScreen() {
  const { colors } = useTheme();
  const [settings, updateSettings, loaded] = useSettings();
  const styles = useSettingsStyles();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [healthBusy, setHealthBusy] = useState<'permissions' | 'sync' | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);

  const healthSupported = isHealthSyncSupported();

  useEffect(() => {
    if (!loaded) return;
    setWebhookUrl(settings.insightsWebhookUrl ?? '');
  }, [loaded, settings]);

  const handleSave = () => {
    updateSettings({ ...settings, insightsWebhookUrl: webhookUrl.trim() || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleToggleHealthSync = (healthSyncEnabled: boolean) => {
    setHealthError(null);
    setHealthStatus(null);
    updateSettings({ ...settings, healthSyncEnabled });
  };

  const handleGrantPermissions = async () => {
    setHealthBusy('permissions');
    setHealthError(null);
    setHealthStatus(null);
    try {
      const granted = await requestHealthPermissions();
      setHealthStatus(granted ? 'Permissions granted.' : null);
      if (!granted) setHealthError('Permission request was denied or unavailable.');
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : String(e));
    } finally {
      setHealthBusy(null);
    }
  };

  const handleSyncNow = async () => {
    setHealthBusy('sync');
    setHealthError(null);
    setHealthStatus(null);
    try {
      const result = await syncHealthData();
      // syncHealthData() persists healthLastSyncedAt via lib/settings.ts's
      // own writeSettings — re-reading here (rather than computing a new
      // timestamp locally) keeps this screen showing the exact value that
      // was actually persisted, and refreshes this component's local
      // `settings` (writeSettings' listener set updates other mounted
      // instances, not the value this closure already captured).
      updateSettings(await readSettings());
      setHealthStatus(
        `Synced ${result.steps} step total${result.steps === 1 ? '' : 's'}, ${result.activities} ` +
          `activit${result.activities === 1 ? 'y' : 'ies'}, ${result.nutrition} nutrition entr${result.nutrition === 1 ? 'y' : 'ies'}.`,
      );
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : String(e));
    } finally {
      setHealthBusy(null);
    }
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
        <View style={[styles.rowBetween, { marginBottom: 8 }]}>
          <Text style={styles.cardTitle}>Health sync</Text>
          {healthSupported && (
            <Switch
              value={settings.healthSyncEnabled}
              onValueChange={handleToggleHealthSync}
              trackColor={{ true: colors.brand }}
            />
          )}
        </View>
        <Text style={styles.hint}>
          Pulls steps, workouts, and nutrition (carb) entries from Apple Health / Health Connect — read-only.
          Workouts and carb entries show up in the Logbook, and all of it (including steps) can be referenced by
          AI Insights. It never counts toward COB or bolus-wizard suggestions, though — you'd still log a
          treatment yourself the way you do today.
        </Text>

        {!healthSupported && (
          <Text style={[styles.hint, { marginBottom: 0 }]}>Not available on this platform.</Text>
        )}

        {healthSupported && settings.healthSyncEnabled && (
          <>
            <Text style={[styles.hint, { marginBottom: 12 }]}>{formatLastSynced(settings.healthLastSyncedAt)}</Text>
            {healthStatus && <Text style={[styles.hint, { color: colors.status.success }]}>{healthStatus}</Text>}
            {healthError && <Text style={[styles.hint, { color: colors.status.danger }]}>{healthError}</Text>}
            <Pressable
              style={[styles.button, styles.buttonSecondary, healthBusy !== null && styles.buttonDisabled]}
              disabled={healthBusy !== null}
              onPress={handleGrantPermissions}
            >
              <Text style={styles.buttonText}>{healthBusy === 'permissions' ? 'Requesting…' : 'Grant permissions'}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, { marginTop: 8 }, healthBusy !== null && styles.buttonDisabled]}
              disabled={healthBusy !== null}
              onPress={handleSyncNow}
            >
              <Text style={styles.buttonText}>{healthBusy === 'sync' ? 'Syncing…' : 'Sync now'}</Text>
            </Pressable>
          </>
        )}
      </Card>

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
