import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { useTheme } from '../../lib/ThemeContext';
import { requestNotificationPermissions, useNotificationSettings } from '../../lib/notifications';
import { SettingsField } from './SettingsField';
import { useSettingsStyles } from './useSettingsStyles';

// Real feature (thresholds + DND persisted, permission requested, and
// actually wired into GlucoseContext's live reading flow — see
// lib/notifications.ts and lib/GlucoseContext.tsx), not a placeholder.
// expo-notifications is a new native module: this needs a dev-client
// rebuild (npx expo run:android) before it can fire on-device.
export function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = useSettingsStyles();
  const [settings, updateSettings, loaded] = useNotificationSettings();
  const [lowThreshold, setLowThreshold] = useState('70');
  const [highThreshold, setHighThreshold] = useState('180');
  const [dndStart, setDndStart] = useState('22:00');
  const [dndEnd, setDndEnd] = useState('07:00');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    setLowThreshold(settings.lowThreshold.toString());
    setHighThreshold(settings.highThreshold.toString());
    setDndStart(settings.dndStart);
    setDndEnd(settings.dndEnd);
  }, [loaded, settings]);

  const handleToggleEnabled = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Notifications blocked',
          'Enable notifications for this app in your device Settings to use glucose alerts.',
        );
        return;
      }
    }
    updateSettings({ ...settings, enabled });
  };

  const handleSaveThresholds = () => {
    const low = parseFloat(lowThreshold) || settings.lowThreshold;
    const high = parseFloat(highThreshold) || settings.highThreshold;
    updateSettings({ ...settings, lowThreshold: low, highThreshold: high, dndStart, dndEnd });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!loaded) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Glucose Alerts</Text>
          {saved && <Text style={styles.confirmed}>Saved ✓</Text>}
        </View>
        <View style={[styles.rowBetween, { marginBottom: 12 }]}>
          <Text style={styles.label}>Enabled</Text>
          <Switch value={settings.enabled} onValueChange={handleToggleEnabled} trackColor={{ true: colors.brand }} />
        </View>
        <Text style={styles.hint}>Get notified when your glucose crosses these thresholds.</Text>
        <SettingsField label="Low threshold (mg/dL)" value={lowThreshold} onChangeText={setLowThreshold} />
        <SettingsField label="High threshold (mg/dL)" value={highThreshold} onChangeText={setHighThreshold} last />
      </Card>

      <Card style={styles.card}>
        <View style={[styles.rowBetween, { marginBottom: 12 }]}>
          <Text style={styles.cardTitle}>Do Not Disturb</Text>
          <Switch
            value={settings.dndEnabled}
            onValueChange={(dndEnabled) => updateSettings({ ...settings, dndEnabled })}
            trackColor={{ true: colors.brand }}
          />
        </View>
        <Text style={styles.hint}>Silence alerts during a scheduled window, e.g. while sleeping.</Text>
        <SettingsField label="Start (24h, HH:MM)" value={dndStart} onChangeText={setDndStart} keyboardType="default" placeholder="22:00" />
        <SettingsField label="End (24h, HH:MM)" value={dndEnd} onChangeText={setDndEnd} keyboardType="default" placeholder="07:00" last />
      </Card>

      <Pressable style={styles.button} onPress={handleSaveThresholds}>
        <Text style={styles.buttonText}>Save</Text>
      </Pressable>
    </ScrollView>
  );
}
