import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { useSettings } from '../../lib/settings';
import { SettingsField } from './SettingsField';
import { useSettingsStyles } from './useSettingsStyles';

function numOrNull(text: string): number | null {
  if (text.trim() === '') return null;
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

// Absorbs the former "Dosing" + "Time in Range" cards from the old flat
// SettingsScreen — merged with "Treatment Configurations" per the spec,
// since there's no real account system yet to warrant a separate card.
// Where Time in Range "really" belongs (here vs. Display and Theme vs.
// staying on the Trends screen) wasn't settled explicitly — kept here
// since it's a personal treatment-adjacent number, not a display
// preference; easy to move later if that's wrong.
export function AccountProfileScreen() {
  const [settings, updateSettings, loaded] = useSettings();
  const styles = useSettingsStyles();
  const [isf, setIsf] = useState('');
  const [carbRatio, setCarbRatio] = useState('');
  const [targetBG, setTargetBG] = useState('');
  const [dia, setDia] = useState('');
  const [penIncrement, setPenIncrement] = useState('1');
  const [maxIOB, setMaxIOB] = useState('');
  const [rangeLow, setRangeLow] = useState('70');
  const [rangeHigh, setRangeHigh] = useState('180');
  const [saved, setSaved] = useState(false);

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Account and Profile</Text>
        {saved && <Text style={styles.confirmed}>Saved ✓</Text>}
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Dosing and Treatment Configuration</Text>
        <Text style={styles.hint}>
          Required for the bolus wizard and predictions. Never pre-filled with a "typical" value — enter your own.
        </Text>
        <SettingsField label="ISF (correction factor, mg/dL per unit)" value={isf} onChangeText={setIsf} />
        <SettingsField label="Carb ratio (grams per unit)" value={carbRatio} onChangeText={setCarbRatio} />
        <SettingsField label="Target BG (mg/dL)" value={targetBG} onChangeText={setTargetBG} />
        <SettingsField label="DIA — duration of insulin action (hours)" value={dia} onChangeText={setDia} />
        <SettingsField label="Pen increment (units, e.g. 1 or 0.5)" value={penIncrement} onChangeText={setPenIncrement} />
        <SettingsField
          label="Max IOB (units) — insulin-on-board safety cap for predictions"
          value={maxIOB}
          onChangeText={setMaxIOB}
          last
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Time in Range</Text>
        <Text style={styles.hint}>
          Used for the Trends screen's Time in Range card. Adjustable if your clinician specifies a different range.
        </Text>
        <SettingsField label="Low threshold (mg/dL)" value={rangeLow} onChangeText={setRangeLow} />
        <SettingsField label="High threshold (mg/dL)" value={rangeHigh} onChangeText={setRangeHigh} last />
      </Card>

      <Pressable style={styles.button} onPress={handleSave}>
        <Text style={styles.buttonText}>Save</Text>
      </Pressable>
    </ScrollView>
  );
}
