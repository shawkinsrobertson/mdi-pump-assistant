import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { isHealthSyncSupported, requestHealthPermissions, syncHealthData } from '../../lib/health/sync';
import { isNightscoutConfigured, syncNightscoutTreatments } from '../../lib/nightscout/sync';
import { readSettings, useSettings, type GlucoseSource } from '../../lib/settings';
import { useTheme } from '../../lib/ThemeContext';
import { SettingsField } from './SettingsField';
import { useSettingsStyles } from './useSettingsStyles';

const PLANNED = ['Continuous glucose monitors', 'Glucose meters', 'Smart pens'];

const GLUCOSE_SOURCES: { value: GlucoseSource; label: string }[] = [
  { value: 'xdrip', label: 'xDrip+' },
  { value: 'nightscout', label: 'Nightscout' },
];

function formatLastSynced(iso: string | null): string {
  if (!iso) return 'Never synced';
  return `Last synced ${new Date(iso).toLocaleString()}`;
}

// Direct device integrations are still "coming soon" (see PLANNED
// below), but this screen also hosts three real integrations: the AI
// Insights webhook URL (lib/tasks/insightTask.ts), HealthKit/Health
// Connect sync (lib/health/sync.ts) — steps, activity, and nutrition
// pulled in read-only, feeding the AI Insights payload
// (lib/insights/insightPayload.ts) — and Nightscout (lib/nightscout/): a
// remote glucose source alternative to xDrip+, plus reference-only
// treatment rows in the Logbook. Nightscout treatments do NOT (yet) feed
// the Insights payload the way Health data does — not built this cycle,
// see AGENTS.md. Neither Health data nor Nightscout treatments ever
// reach oref0's COB/IOB math either way.
export function IntegrationsScreen() {
  const { colors } = useTheme();
  const [settings, updateSettings, loaded] = useSettings();
  const styles = useSettingsStyles();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [healthBusy, setHealthBusy] = useState<'permissions' | 'sync' | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [nsUrl, setNsUrl] = useState('');
  const [nsToken, setNsToken] = useState('');
  const [nsBusy, setNsBusy] = useState(false);
  const [nsError, setNsError] = useState<string | null>(null);
  const [nsStatus, setNsStatus] = useState<string | null>(null);

  const healthSupported = isHealthSyncSupported();
  const nightscoutConfigured = isNightscoutConfigured(settings);

  useEffect(() => {
    if (!loaded) return;
    setWebhookUrl(settings.insightsWebhookUrl ?? '');
    setNsUrl(settings.nightscoutUrl ?? '');
    setNsToken(settings.nightscoutToken ?? '');
  }, [loaded, settings]);

  const handleSave = () => {
    updateSettings({ ...settings, insightsWebhookUrl: webhookUrl.trim() || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveNightscout = () => {
    const nextUrl = nsUrl.trim() || null;
    const nextToken = nsToken.trim() || null;
    updateSettings({
      ...settings,
      nightscoutUrl: nextUrl,
      nightscoutToken: nextToken,
      // Falls back to xDrip+ if the currently-active Nightscout source
      // just got un-configured (a cleared field), rather than leaving
      // glucoseSource pointed at a source with nothing to poll.
      glucoseSource: settings.glucoseSource === 'nightscout' && !(nextUrl && nextToken) ? 'xdrip' : settings.glucoseSource,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSelectGlucoseSource = (glucoseSource: GlucoseSource) => {
    if (glucoseSource === 'nightscout' && !nightscoutConfigured) return; // toggle itself is disabled below; belt-and-suspenders
    updateSettings({ ...settings, glucoseSource });
  };

  const handleSyncNightscoutNow = async () => {
    setNsBusy(true);
    setNsError(null);
    setNsStatus(null);
    try {
      const result = await syncNightscoutTreatments();
      // Same reasoning as handleSyncNow below: re-read rather than compute
      // nightscoutLastSyncedAt locally, so this screen shows exactly what
      // syncNightscoutTreatments() actually persisted.
      updateSettings(await readSettings());
      setNsStatus(`Synced ${result.treatments} treatment${result.treatments === 1 ? '' : 's'}.`);
    } catch (e) {
      setNsError(e instanceof Error ? e.message : String(e));
    } finally {
      setNsBusy(false);
    }
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
        <Text style={styles.cardTitle}>Nightscout</Text>
        <Text style={styles.hint}>
          Connects to a remote Nightscout instance. Glucose readings can replace xDrip+ as your live CGM source
          below, and treatments (boluses/carbs logged there — e.g. by a pump's closed-loop system, or another app)
          show up in the Logbook for reference. Nightscout treatments never count toward COB or bolus-wizard
          suggestions.
        </Text>
        <SettingsField
          label="Nightscout URL"
          value={nsUrl}
          onChangeText={setNsUrl}
          keyboardType="url"
          placeholder="https://your-nightscout.example.com"
          autoCapitalize="none"
        />
        <SettingsField
          label="API token"
          value={nsToken}
          onChangeText={setNsToken}
          keyboardType="default"
          placeholder="token"
          autoCapitalize="none"
          secureTextEntry
          last
        />
      </Card>

      <Pressable style={styles.button} onPress={handleSaveNightscout}>
        <Text style={styles.buttonText}>Save</Text>
      </Pressable>

      <Card style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>Glucose source</Text>
        <Text style={styles.hint}>
          Which live feed drives the Dashboard's current BG, chart, and COB/IOB predictions. Only one at a time —
          xDrip+ and Nightscout typically mirror the same underlying sensor data, so running both would
          double-count the same readings rather than combine them.
        </Text>
        <View style={styles.toggleRow}>
          {GLUCOSE_SOURCES.map((source) => {
            const disabled = source.value === 'nightscout' && !nightscoutConfigured;
            const active = settings.glucoseSource === source.value;
            return (
              <Pressable
                key={source.value}
                style={[styles.toggleButton, active && styles.toggleButtonActive, disabled && styles.buttonDisabled]}
                disabled={disabled}
                onPress={() => handleSelectGlucoseSource(source.value)}
              >
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{source.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {!nightscoutConfigured && (
          <Text style={[styles.hint, { marginTop: 8, marginBottom: 0 }]}>
            Set your Nightscout URL and token above, then save, to enable it as a glucose source.
          </Text>
        )}
      </Card>

      {nightscoutConfigured && (
        <Card style={[styles.card, { marginTop: 16 }]}>
          <Text style={styles.cardTitle}>Nightscout treatments sync</Text>
          <Text style={[styles.hint, { marginBottom: 12 }]}>{formatLastSynced(settings.nightscoutLastSyncedAt)}</Text>
          {nsStatus && <Text style={[styles.hint, { color: colors.status.success }]}>{nsStatus}</Text>}
          {nsError && <Text style={[styles.hint, { color: colors.status.danger }]}>{nsError}</Text>}
          <Pressable
            style={[styles.button, nsBusy && styles.buttonDisabled]}
            disabled={nsBusy}
            onPress={handleSyncNightscoutNow}
          >
            <Text style={styles.buttonText}>{nsBusy ? 'Syncing…' : 'Sync now'}</Text>
          </Pressable>
        </Card>
      )}

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
