import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import rawSeedEntries from '../scripts/seed-data/entries.json';
import rawSeedTreatments from '../scripts/seed-data/treatments.json';
import { insertReadings } from '../lib/db/glucoseReadings';
import { DuplicateTreatmentError, insertTreatment } from '../lib/db/treatments';
import { parseNightscoutEntries, parseNightscoutTreatments } from '../lib/importers/nightscout';
import { useSettings } from '../lib/settings';

function numOrNull(text: string): number | null {
  if (text.trim() === '') return null;
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

export function SettingsScreen() {
  const [settings, updateSettings, loaded] = useSettings();
  const [isf, setIsf] = useState('');
  const [carbRatio, setCarbRatio] = useState('');
  const [targetBG, setTargetBG] = useState('');
  const [dia, setDia] = useState('');
  const [penIncrement, setPenIncrement] = useState('1');
  const [maxIOB, setMaxIOB] = useState('');
  const [rangeLow, setRangeLow] = useState('70');
  const [rangeHigh, setRangeHigh] = useState('180');
  const [saved, setSaved] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    setIsf(settings.isf?.toString() ?? '');
    setCarbRatio(settings.carbRatio?.toString() ?? '');
    setTargetBG(settings.targetBG?.toString() ?? '');
    setDia(settings.dia?.toString() ?? '');
    setPenIncrement(settings.penIncrement.toString());
    setMaxIOB(settings.maxIOB?.toString() ?? '');
    setRangeLow(settings.rangeLow.toString());
    setRangeHigh(settings.rangeHigh.toString());
  }, [loaded, settings]);

  const handleSave = () => {
    updateSettings({
      isf: numOrNull(isf),
      carbRatio: numOrNull(carbRatio),
      targetBG: numOrNull(targetBG),
      dia: numOrNull(dia),
      penIncrement: numOrNull(penIncrement) ?? 1,
      maxIOB: numOrNull(maxIOB),
      rangeLow: numOrNull(rangeLow) ?? 70,
      rangeHigh: numOrNull(rangeHigh) ?? 180,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Dev-only testing aid: seeds the local DB from a real (small) Nightscout
  // export bundled at build time (scripts/seed-data/) — NOT the v1 import
  // feature (that's deferred; see AGENTS.md). Remove this section before
  // any real release build.
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
      setSeedResult(
        `Seeded ${readings.length} glucose readings, ${inserted} treatments (${duplicates} already present).`,
      );
    } catch (e) {
      setSeedResult(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Settings</Text>
        {saved && <Text style={styles.confirmed}>Saved ✓</Text>}
      </View>
      <Text style={styles.hint}>
        Required for the bolus wizard and predictions. Never pre-filled with a "typical" value — enter your own.
      </Text>

      <Field label="ISF (correction factor, mg/dL per unit)" value={isf} onChangeText={setIsf} />
      <Field label="Carb ratio (grams per unit)" value={carbRatio} onChangeText={setCarbRatio} />
      <Field label="Target BG (mg/dL)" value={targetBG} onChangeText={setTargetBG} />
      <Field label="DIA — duration of insulin action (hours)" value={dia} onChangeText={setDia} />
      <Field label="Pen increment (units, e.g. 1 or 0.5)" value={penIncrement} onChangeText={setPenIncrement} />
      <Field
        label="Max IOB (units) — insulin-on-board safety cap for predictions"
        value={maxIOB}
        onChangeText={setMaxIOB}
      />
      <Field
        label="Time in Range — low threshold (mg/dL)"
        value={rangeLow}
        onChangeText={setRangeLow}
      />
      <Field
        label="Time in Range — high threshold (mg/dL)"
        value={rangeHigh}
        onChangeText={setRangeHigh}
      />

      <Pressable style={styles.button} onPress={handleSave}>
        <Text style={styles.buttonText}>Save</Text>
      </Pressable>

      <View style={styles.devSection}>
        <Text style={styles.devTitle}>Developer</Text>
        <Text style={styles.hint}>
          Loads a real (small) Nightscout export bundled with the app for testing Trends/Prediction against real
          data. Temporary testing aid, not the (later) real import feature.
        </Text>
        <Pressable
          style={[styles.button, styles.buttonSecondary, seeding && styles.buttonDisabled]}
          disabled={seeding}
          onPress={handleSeedTestData}
        >
          {seeding ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Seed test data</Text>}
        </Pressable>
        {seedResult && <Text style={styles.seedResult}>{seedResult}</Text>}
      </View>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="—"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 24,
    paddingTop: 60,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  confirmed: {
    color: '#16a34a',
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    color: '#888',
    marginBottom: 20,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonSecondary: {
    backgroundColor: '#888',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  devSection: {
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  devTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  seedResult: {
    fontSize: 13,
    color: '#333',
    marginTop: 8,
  },
});
