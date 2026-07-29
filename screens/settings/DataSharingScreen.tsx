import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text } from 'react-native';
import rawSeedEntries from '../../scripts/seed-data/entries.json';
import rawSeedTreatments from '../../scripts/seed-data/treatments.json';
import { Card } from '../../components/ui/Card';
import { insertReadings } from '../../lib/db/glucoseReadings';
import { DuplicateTreatmentError, insertTreatment } from '../../lib/db/treatments';
import { parseNightscoutEntries, parseNightscoutTreatments } from '../../lib/importers/nightscout';
import { useTheme } from '../../lib/ThemeContext';
import { useSettingsStyles } from './useSettingsStyles';

// Placeholder category — explicitly "coming soon" per the spec (export/
// delete/care-provider sharing). The real per-v1 clinician export lives
// as an icon on the Trends screen instead, not here.
//
// The dev-only Nightscout seed tool (moved here from the old flat
// SettingsScreen — it's a data-loading utility, so this is a more
// natural home than Account/Profile) stays exactly as before: remove
// before any real release build.
export function DataSharingScreen() {
  const { colors } = useTheme();
  const styles = useSettingsStyles();
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  const handleSeedTestData = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const readings = parseNightscoutEntries(rawSeedEntries);
      await insertReadings('nightscout-seed', readings);

      const treatments = parseNightscoutTreatments(rawSeedTreatments);
      let inserted = 0;
      let duplicates = 0;
      for (const t of treatments) {
        try {
          await insertTreatment(t);
          inserted++;
        } catch (e) {
          if (e instanceof DuplicateTreatmentError) {
            duplicates++;
          } else {
            throw e;
          }
        }
      }
      setSeedResult(`Seeded ${readings.length} glucose readings, ${inserted} treatments (${duplicates} already present).`);
    } catch (e) {
      setSeedResult(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Coming soon</Text>
        <Text style={styles.hint}>
          Export, delete-my-data, and sharing with care providers are planned but not yet built. The clinician export
          for Trends data will be an icon on the Trends screen itself for v1, not here.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Developer</Text>
        <Text style={styles.hint}>
          Loads a real (small) Nightscout export bundled with the app for testing Trends/Prediction against real
          data. Temporary testing aid, not the (later) real import feature.
        </Text>
        <Pressable
          style={[styles.button, styles.buttonSecondary, seeding && styles.buttonDisabled]}
          disabled={seeding}
          onPress={handleSeedTestData}
        >
          {seeding ? <ActivityIndicator color={colors.text.inverse} /> : <Text style={styles.buttonText}>Seed test data</Text>}
        </Pressable>
        {seedResult && <Text style={[styles.hint, { marginTop: 8, marginBottom: 0 }]}>{seedResult}</Text>}
      </Card>
    </ScrollView>
  );
}
