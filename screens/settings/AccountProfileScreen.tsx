import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import type { LongActingInsulinType } from '../../lib/mdi/basalCurve';
import { useSettings, type BasalScheduleConfig } from '../../lib/settings';
import { requestNotificationPermissions } from '../../lib/notifications';
import { rescheduleBasalReminders } from '../../lib/tasks/basalReminders';
import { useTheme } from '../../lib/ThemeContext';
import { SettingsField } from './SettingsField';
import { useSettingsStyles } from './useSettingsStyles';

function numOrNull(text: string): number | null {
  if (text.trim() === '') return null;
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

const BASAL_TYPES: { value: LongActingInsulinType; label: string }[] = [
  { value: 'glargine', label: 'Glargine' },
  { value: 'detemir', label: 'Detemir' },
  { value: 'degludec', label: 'Degludec' },
  { value: 'other', label: 'Other' },
];

const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

let nextTimeRowId = 0;
function newTimeRowId(): string {
  nextTimeRowId += 1;
  return `t${nextTimeRowId}`;
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
  const { colors } = useTheme();
  const [isf, setIsf] = useState('');
  const [carbRatio, setCarbRatio] = useState('');
  const [targetBG, setTargetBG] = useState('');
  const [dia, setDia] = useState('');
  const [penIncrement, setPenIncrement] = useState('1');
  const [maxIOB, setMaxIOB] = useState('');
  const [rangeLow, setRangeLow] = useState('70');
  const [rangeHigh, setRangeHigh] = useState('180');
  const [saved, setSaved] = useState(false);

  const [basalType, setBasalType] = useState<LongActingInsulinType>('glargine');
  const [basalCustomName, setBasalCustomName] = useState('');
  const [basalCustomDurationHours, setBasalCustomDurationHours] = useState('');
  const [basalUnits, setBasalUnits] = useState('');
  const [basalTimes, setBasalTimes] = useState<{ id: string; value: string }[]>([]);

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
    const schedule = settings.basalSchedule;
    setBasalType(schedule?.type ?? 'glargine');
    setBasalCustomName(schedule?.customName ?? '');
    setBasalCustomDurationHours(schedule?.customDurationHours?.toString() ?? '');
    setBasalUnits(schedule?.units?.toString() ?? '');
    setBasalTimes((schedule?.times ?? []).map((value) => ({ id: newTimeRowId(), value })));
  }, [loaded, settings]);

  const addBasalTime = () => setBasalTimes((prev) => [...prev, { id: newTimeRowId(), value: '08:00' }]);
  const removeBasalTime = (id: string) => setBasalTimes((prev) => prev.filter((t) => t.id !== id));
  const editBasalTime = (id: string, value: string) =>
    setBasalTimes((prev) => prev.map((t) => (t.id === id ? { ...t, value } : t)));

  const handleSave = () => {
    const validTimes = basalTimes.map((t) => t.value.trim()).filter((v) => TIME_PATTERN.test(v));
    const isOtherBasal = basalType === 'other';
    // No times configured means nothing to remind about — treat the
    // schedule as unset rather than storing a schedule with no times.
    const basalSchedule: BasalScheduleConfig | null =
      validTimes.length > 0
        ? {
            type: basalType,
            customName: isOtherBasal && basalCustomName.trim() !== '' ? basalCustomName.trim() : null,
            customDurationHours: isOtherBasal ? numOrNull(basalCustomDurationHours) : null,
            units: numOrNull(basalUnits),
            times: validTimes,
          }
        : null;

    updateSettings({
      ...settings,
      isf: numOrNull(isf),
      carbRatio: numOrNull(carbRatio),
      targetBG: numOrNull(targetBG),
      dia: numOrNull(dia),
      penIncrement: numOrNull(penIncrement) ?? 1,
      maxIOB: numOrNull(maxIOB),
      rangeLow: numOrNull(rangeLow) ?? 70,
      rangeHigh: numOrNull(rangeHigh) ?? 180,
      basalSchedule,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    // Reminders only ever prompt-and-confirm (see InsulinLogModal's Basal
    // mode) — requesting permission here, at the point a schedule is
    // actually being turned on, rather than assuming it was already
    // granted via the separate glucose-alerts flow in Notifications.
    requestNotificationPermissions()
      .then(() => rescheduleBasalReminders(basalSchedule))
      .catch((e) => console.error('Failed to schedule basal reminders:', e));
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
        />

        <Text style={[styles.cardTitle, { fontSize: 15, marginTop: 4 }]}>Basal Schedule</Text>
        <Text style={styles.hint}>
          Reminds you at each scheduled time to log your basal dose — it never logs anything on its own. Tap the
          reminder (or use Insulin &gt; Basal on the Dashboard any time) to review and confirm what you actually
          took.
        </Text>

        <View style={styles.toggleRow}>
          {BASAL_TYPES.map((t) => (
            <Pressable
              key={t.value}
              style={[styles.toggleButton, basalType === t.value && styles.toggleButtonActive]}
              onPress={() => setBasalType(t.value)}
            >
              <Text style={[styles.toggleText, basalType === t.value && styles.toggleTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {basalType === 'other' && (
          <>
            <SettingsField
              label="Name"
              value={basalCustomName}
              onChangeText={setBasalCustomName}
              keyboardType="default"
              placeholder="e.g. Toujeo"
            />
            <SettingsField
              label="Duration (hours) — for prediction math"
              value={basalCustomDurationHours}
              onChangeText={setBasalCustomDurationHours}
            />
          </>
        )}

        <SettingsField label="Units" value={basalUnits} onChangeText={setBasalUnits} />

        <Text style={styles.label}>Times</Text>
        {basalTimes.map((t) => (
          <View key={t.id} style={[styles.rowBetween, { marginBottom: 8 }]}>
            <TextInput
              style={[styles.input, { flex: 1, marginRight: 8 }]}
              value={t.value}
              onChangeText={(v) => editBasalTime(t.id, v)}
              placeholder="HH:MM"
              placeholderTextColor={colors.text.placeholder}
              keyboardType="default"
            />
            <Pressable onPress={() => removeBasalTime(t.id)} hitSlop={8}>
              <Text style={{ color: colors.status.danger, fontWeight: '600' }}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <Pressable onPress={addBasalTime}>
          <Text style={{ color: colors.accent.info, fontWeight: '600' }}>+ Add time</Text>
        </Pressable>
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
