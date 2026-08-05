import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { updateActivity, type ActivityIntensity } from '../lib/db/activities';
import { updateBasalDose } from '../lib/db/basalDoses';
import { updateNoteEntry } from '../lib/db/noteEntries';
import { updateTreatment, type EventType } from '../lib/db/treatments';
import type { LogEntry } from '../lib/logbookEntry';
import type { LongActingInsulinType } from '../lib/mdi/basalCurve';
import { useTheme } from '../lib/ThemeContext';

interface LogbookEntryModalProps {
  entry: LogEntry | null; // null = hidden
  onClose: () => void;
  onSaved: () => void;
}

const TREATMENT_TYPES: EventType[] = ['Meal Bolus', 'Correction Bolus'];
const BASAL_TYPES: { value: LongActingInsulinType; label: string }[] = [
  { value: 'glargine', label: 'Glargine' },
  { value: 'detemir', label: 'Detemir' },
  { value: 'degludec', label: 'Degludec' },
  { value: 'other', label: 'Other' },
];
const INTENSITIES: { value: ActivityIntensity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'med', label: 'Medium' },
  { value: 'high', label: 'High' },
];

// Edit modal for an existing Logbook entry — covers both entry kinds
// (bolus/correction treatment, or basal dose). "Add notes" from the spec
// lives here as a notes field on the same edit form, rather than a
// separate action, since the notes it describes are always attached to
// an existing entry (see AGENTS.md).
export function LogbookEntryModal({ entry, onClose, onSaved }: LogbookEntryModalProps) {
  const { colors, radius, spacing } = useTheme();
  const styles = useMemo(() => makeStyles(colors, radius, spacing), [colors, radius, spacing]);
  const [eventType, setEventType] = useState<EventType>('Meal Bolus');
  const [insulin, setInsulin] = useState('');
  const [carbs, setCarbs] = useState('');
  const [basalType, setBasalType] = useState<LongActingInsulinType>('glargine');
  const [customName, setCustomName] = useState('');
  const [customDurationHours, setCustomDurationHours] = useState('');
  const [units, setUnits] = useState('');
  const [intensity, setIntensity] = useState<ActivityIntensity>('low');
  const [duration, setDuration] = useState('');
  const [noteText, setNoteText] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) return;
    setError(null);
    if (entry.kind === 'treatment') {
      setEventType(entry.treatment.eventType);
      setInsulin(entry.treatment.insulin?.toString() ?? '');
      setCarbs(entry.treatment.carbs?.toString() ?? '');
      setNotes(entry.treatment.notes ?? '');
    } else if (entry.kind === 'basal') {
      setBasalType(entry.dose.type);
      setCustomName(entry.dose.customName ?? '');
      setCustomDurationHours(entry.dose.customDurationHours?.toString() ?? '');
      setUnits(entry.dose.units.toString());
      setNotes(entry.dose.notes ?? '');
    } else if (entry.kind === 'activity') {
      setIntensity(entry.activity.intensity);
      setDuration(entry.activity.durationMinutes?.toString() ?? '');
    } else {
      setNoteText(entry.note.text);
    }
  }, [entry]);

  const commit = useCallback(async () => {
    if (!entry) return;
    setSaving(true);
    setError(null);
    try {
      if (entry.kind === 'treatment') {
        const insulinNum = parseFloat(insulin);
        const carbsNum = parseFloat(carbs);
        await updateTreatment(entry.treatment.id, {
          eventType,
          insulin: Number.isFinite(insulinNum) ? insulinNum : null,
          carbs: Number.isFinite(carbsNum) ? carbsNum : null,
          notes: notes.trim() === '' ? null : notes.trim(),
        });
      } else if (entry.kind === 'basal') {
        const unitsNum = parseFloat(units) || 0;
        const durationNum = parseFloat(customDurationHours);
        await updateBasalDose(entry.dose.id, {
          type: basalType,
          units: unitsNum,
          notes: notes.trim() === '' ? null : notes.trim(),
          customName: basalType === 'other' && customName.trim() !== '' ? customName.trim() : null,
          customDurationHours: basalType === 'other' && Number.isFinite(durationNum) ? durationNum : null,
        });
      } else if (entry.kind === 'activity') {
        const durationNum = parseFloat(duration);
        await updateActivity(entry.activity.id, {
          intensity,
          durationMinutes: Number.isFinite(durationNum) && durationNum > 0 ? durationNum : null,
        });
      } else {
        if (noteText.trim() === '') {
          setError('Note text can\'t be empty.');
          setSaving(false);
          return;
        }
        await updateNoteEntry(entry.note.id, { text: noteText.trim() });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [
    entry,
    eventType,
    insulin,
    carbs,
    basalType,
    customName,
    customDurationHours,
    units,
    intensity,
    duration,
    noteText,
    notes,
    onSaved,
    onClose,
  ]);

  const handleSave = useCallback(() => {
    Alert.alert('Save changes?', 'This will update the logged entry.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: commit },
    ]);
  }, [commit]);

  if (!entry) return null;

  return (
    <Modal visible={entry !== null} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
          </Pressable>
          <Text style={styles.title}>Edit Entry</Text>
          <View style={styles.headerSpacer} />
        </View>

        {entry.kind === 'treatment' && (
          <>
            <View style={styles.toggleRow}>
              {TREATMENT_TYPES.map((t) => (
                <Pressable
                  key={t}
                  style={[styles.toggleButton, eventType === t && styles.toggleButtonActive]}
                  onPress={() => setEventType(t)}
                >
                  <Text style={[styles.toggleText, eventType === t && styles.toggleTextActive]}>
                    {t === 'Meal Bolus' ? 'Meal' : 'Correction'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Field label="Insulin (U)" value={insulin} onChangeText={setInsulin} styles={styles} />
            <Field label="Carbs (g)" value={carbs} onChangeText={setCarbs} styles={styles} />
          </>
        )}

        {entry.kind === 'basal' && (
          <>
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
                <View style={styles.field}>
                  <Text style={styles.label}>Name</Text>
                  <TextInput
                    style={styles.input}
                    value={customName}
                    onChangeText={setCustomName}
                    placeholder="e.g. Toujeo"
                    placeholderTextColor={colors.text.placeholder}
                  />
                </View>
                <Field label="Duration (hours)" value={customDurationHours} onChangeText={setCustomDurationHours} styles={styles} />
              </>
            )}
            <Field label="Units" value={units} onChangeText={setUnits} styles={styles} />
          </>
        )}

        {entry.kind === 'activity' && (
          <>
            <View style={styles.toggleRow}>
              {INTENSITIES.map((t) => (
                <Pressable
                  key={t.value}
                  style={[styles.toggleButton, intensity === t.value && styles.toggleButtonActive]}
                  onPress={() => setIntensity(t.value)}
                >
                  <Text style={[styles.toggleText, intensity === t.value && styles.toggleTextActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Duration (minutes)" value={duration} onChangeText={setDuration} styles={styles} />
          </>
        )}

        {entry.kind === 'note' && (
          <View style={styles.field}>
            <Text style={styles.label}>Note</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={noteText}
              onChangeText={setNoteText}
              multiline
              placeholder="What's going on?"
              placeholderTextColor={colors.text.placeholder}
            />
          </View>
        )}

        {(entry.kind === 'treatment' || entry.kind === 'basal') && (
          <View style={styles.field}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Add a note…"
              placeholderTextColor={colors.text.placeholder}
            />
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.button, saving && styles.buttonDisabled]} disabled={saving} onPress={handleSave}>
          {saving ? <ActivityIndicator color={colors.text.inverse} /> : <Text style={styles.buttonText}>Save</Text>}
        </Pressable>
        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={onClose}>
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  styles,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.text.placeholder}
      />
    </View>
  );
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  radius: ReturnType<typeof useTheme>['radius'],
  spacing: ReturnType<typeof useTheme>['spacing'],
) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    padding: spacing.xl,
    paddingTop: 60,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  headerSpacer: {
    width: 26,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  toggleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.bg.primary,
  },
  toggleButtonActive: {
    borderColor: colors.action.primaryBg,
    backgroundColor: colors.action.primaryBg,
  },
  toggleText: {
    color: colors.text.secondary,
    fontWeight: '600',
    fontSize: 14,
  },
  toggleTextActive: {
    color: colors.text.inverse,
  },
  field: {
    marginBottom: spacing.base,
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
  notesInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  error: {
    color: colors.status.danger,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  button: {
    backgroundColor: colors.action.primaryBg,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  buttonSecondary: {
    backgroundColor: colors.action.secondaryBg,
    marginTop: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.text.inverse,
    fontWeight: '600',
  },
  });
}
