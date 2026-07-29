import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import rawSeedEntries from '../scripts/seed-data/entries.json';
import rawSeedTreatments from '../scripts/seed-data/treatments.json';
import { Card } from '../components/ui/Card';
import { insertReadings } from '../lib/db/glucoseReadings';
import { DuplicateTreatmentError, insertTreatment } from '../lib/db/treatments';
import { parseNightscoutEntries, parseNightscoutTreatments } from '../lib/importers/nightscout';
import { useSettings } from '../lib/settings';
import { colors, radius, spacing } from '../lib/theme';

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

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Dosing</Text>
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
          last
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Time in Range</Text>
        <Text style={styles.hint}>Used for the Trends screen's Time in Range card. Adjustable if your clinician specifies a different range.</Text>
        <Field label="Low threshold (mg/dL)" value={rangeLow} onChangeText={setRangeLow} />
        <Field label="High threshold (mg/dL)" value={rangeHigh} onChangeText={setRangeHigh} last />
      </Card>

      <Pressable style={styles.button} onPress={handleSave}>
        <Text style={styles.buttonText}>Save</Text>
      </Pressable>

      <Card style={[styles.card, styles.devCard]}>
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
          {seeding ? <ActivityIndicator color={colors.text.inverse} /> : <Text style={styles.buttonText}>Seed test data</Text>}
        </Pressable>
        {seedResult && <Text style={styles.seedResult}>{seedResult}</Text>}
      </Card>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  last,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.field, last && styles.fieldLast]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={colors.text.placeholder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.surface,
  },
  content: {
    padding: spacing.xl,
    paddingTop: 60,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  confirmed: {
    color: colors.status.success,
    fontWeight: '600',
  },
  card: {
    marginBottom: spacing.base,
  },
  devCard: {
    marginTop: spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: 13,
    color: colors.text.tertiary,
    marginBottom: spacing.base,
  },
  field: {
    marginBottom: spacing.base,
  },
  fieldLast: {
    marginBottom: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.label,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smMd,
    fontSize: 16,
    color: colors.text.primary,
  },
  button: {
    backgroundColor: colors.action.primaryBg,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: colors.action.secondaryBg,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.text.inverse,
    fontWeight: '600',
  },
  devTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  seedResult: {
    fontSize: 13,
    color: colors.text.label,
    marginTop: spacing.sm,
  },
});
