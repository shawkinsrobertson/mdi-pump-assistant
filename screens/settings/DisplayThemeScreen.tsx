import { ScrollView, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { useTheme, type ThemeMode, type TimeFormat } from '../../lib/ThemeContext';
import type { FontSizePreference } from '../../lib/theme';
import { SegmentedControl } from './SegmentedControl';
import { useSettingsStyles } from './useSettingsStyles';

const MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const FONT_SIZE_OPTIONS: { value: FontSizePreference; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const TIME_FORMAT_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: '12h', label: '12-hour' },
  { value: '24h', label: '24-hour' },
];

// Real, persisted, and functional today — but only Settings itself (and
// its sub-screens) actually re-render with the chosen theme/font size
// right now. Dashboard/Logbook/Trends still use lib/theme.ts's static
// `colors` export and haven't been migrated to consume useTheme() yet;
// see AGENTS.md for the follow-up plan.
export function DisplayThemeScreen() {
  const { display, updateDisplay, displayLoaded } = useTheme();
  const styles = useSettingsStyles();

  if (!displayLoaded) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Theme</Text>
        <Text style={styles.hint}>Applies across the app. "System" follows your device's light/dark setting.</Text>
        <SegmentedControl
          options={MODE_OPTIONS}
          value={display.mode}
          onChange={(mode) => updateDisplay({ ...display, mode })}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Font Size</Text>
        <Text style={styles.hint}>Scales text throughout Settings (rolling out to the rest of the app next).</Text>
        <SegmentedControl
          options={FONT_SIZE_OPTIONS}
          value={display.fontSize}
          onChange={(fontSize) => updateDisplay({ ...display, fontSize })}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Time Format</Text>
        <View style={{ marginBottom: 4 }} />
        <SegmentedControl
          options={TIME_FORMAT_OPTIONS}
          value={display.timeFormat}
          onChange={(timeFormat) => updateDisplay({ ...display, timeFormat })}
        />
      </Card>
    </ScrollView>
  );
}
