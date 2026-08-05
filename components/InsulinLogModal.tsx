import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DuplicateBasalDoseError, insertBasalDose } from '../lib/db/basalDoses';
import { DuplicateTreatmentError, insertTreatment } from '../lib/db/treatments';
import type { LongActingInsulinType } from '../lib/mdi/basalCurve';
import { useSettings } from '../lib/settings';
import { useTheme } from '../lib/ThemeContext';

type Mode = 'bolus' | 'basal';

interface InsulinLogModalProps {
  visible: boolean;
  onClose: () => void;
  onLogged: () => void;
  // Set by DashboardScreen when this modal is opened from a basal
  // reminder notification tap — see lib/tasks/basalReminders.ts.
  initialMode?: Mode;
}

const BASAL_TYPES: { value: LongActingInsulinType; label: string }[] = [
  { value: 'glargine', label: 'Glargine' },
  { value: 'detemir', label: 'Detemir' },
  { value: 'degludec', label: 'Degludec' },
  { value: 'other', label: 'Other' },
];

// Quick Action: log either a correction bolus (no bolus-wizard
// calculation — that's BolusWizardCard's job) or a basal/long-acting
// dose, via a mode toggle rather than two separate modals. The basal
// side both replaces the old standalone BasalDoseModal and serves as the
// ad-hoc/deviation logging path for the recurring schedule configured in
// Settings > Account and Profile (splitting a dose, an extra correction
// shot, a day the schedule wasn't followed) — the schedule itself only
// ever reminds, it never writes a dose on its own, so this modal is the
// one and only place a basal_doses row actually gets created.
export function InsulinLogModal({ visible, onClose, onLogged, initialMode }: InsulinLogModalProps) {
  const { colors, radius, spacing } = useTheme();
  const styles = useMemo(() => makeStyles(colors, radius, spacing), [colors, radius, spacing]);
  const [settings] = useSettings();
  const [mode, setMode] = useState<Mode>('bolus');
  const [units, setUnits] = useState('');

  const [basalType, setBasalType] = useState<LongActingInsulinType>('glargine');
  const [basalCustomName, setBasalCustomName] = useState('');
  const [basalCustomDuration, setBasalCustomDuration] = useState('');
  const [basalUnits, setBasalUnits] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefillBasalFromSchedule = useCallback(() => {
    const schedule = settings.basalSchedule;
    if (!schedule) return;
    setBasalType(schedule.type);
    setBasalCustomName(schedule.customName ?? '');
    setBasalCustomDuration(schedule.customDurationHours?.toString() ?? '');
    setBasalUnits(schedule.units?.toString() ?? '');
  }, [settings.basalSchedule]);

  // Reset to the requested mode each time the modal opens (rather than
  // carrying over whatever was left from the previous time it was
  // opened), and prefill from the configured schedule when opening
  // straight into Basal mode (i.e. from a reminder tap).
  useEffect(() => {
    if (!visible) return;
    const startMode = initialMode ?? 'bolus';
    setMode(startMode);
    setError(null);
    if (startMode === 'basal') prefillBasalFromSchedule();
  }, [visible, initialMode, prefillBasalFromSchedule]);

  const selectBasalMode = useCallback(() => {
    setMode('basal');
    prefillBasalFromSchedule();
  }, [prefillBasalFromSchedule]);

  const clear = useCallback(() => {
    setUnits('');
    setBasalType('glargine');
    setBasalCustomName('');
    setBasalCustomDuration('');
    setBasalUnits('');
    setError(null);
  }, []);

  const commitBolus = useCallback(async () => {
    const unitsNum = parseFloat(units);
    if (!Number.isFinite(unitsNum) || unitsNum <= 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await insertTreatment({
        eventType: 'Correction Bolus',
        insulin: unitsNum,
        carbs: null,
        createdAt: new Date().toISOString(),
      });
      clear();
      onLogged();
      onClose();
    } catch (e) {
      if (e instanceof DuplicateTreatmentError) {
        setError('That looks like a duplicate of what you just logged — not saved again.');
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSubmitting(false);
    }
  }, [units, clear, onLogged, onClose]);

  const commitBasal = useCallback(async () => {
    const unitsNum = parseFloat(basalUnits);
    if (!Number.isFinite(unitsNum) || unitsNum <= 0) return;
    const isOther = basalType === 'other';
    const durationNum = parseFloat(basalCustomDuration);
    if (isOther && (basalCustomName.trim() === '' || !Number.isFinite(durationNum) || durationNum <= 0)) return;

    setSubmitting(true);
    setError(null);
    try {
      await insertBasalDose({
        type: basalType,
        units: unitsNum,
        injectedAt: new Date().toISOString(),
        customName: isOther ? basalCustomName.trim() : null,
        customDurationHours: isOther ? durationNum : null,
      });
      clear();
      onLogged();
      onClose();
    } catch (e) {
      if (e instanceof DuplicateBasalDoseError) {
        setError('That looks like a duplicate of what you just logged — not saved again.');
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSubmitting(false);
    }
  }, [basalType, basalCustomName, basalCustomDuration, basalUnits, clear, onLogged, onClose]);

  const handleSave = useCallback(() => {
    if (mode === 'bolus') {
      Alert.alert('Log insulin?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log', onPress: commitBolus },
      ]);
    } else {
      const label = basalType === 'other' ? basalCustomName.trim() || 'basal' : basalType;
      Alert.alert('Log this basal dose?', `${basalUnits} U ${label}`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log', onPress: commitBasal },
      ]);
    }
  }, [mode, commitBolus, commitBasal, basalType, basalCustomName, basalUnits]);

  const isOtherBasal = basalType === 'other';
  const basalUnitsNum = parseFloat(basalUnits);
  const basalDurationNum = parseFloat(basalCustomDuration);
  const basalValid =
    Number.isFinite(basalUnitsNum) &&
    basalUnitsNum > 0 &&
    (!isOtherBasal || (basalCustomName.trim() !== '' && Number.isFinite(basalDurationNum) && basalDurationNum > 0));
  const bolusUnitsNum = parseFloat(units);
  const saveDisabled =
    submitting || (mode === 'bolus' ? !(Number.isFinite(bolusUnitsNum) && bolusUnitsNum > 0) : !basalValid);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Insulin</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.text.primary} />
            </Pressable>
          </View>

          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeButton, mode === 'bolus' && styles.modeButtonActive]}
              onPress={() => setMode('bolus')}
            >
              <Text style={[styles.modeText, mode === 'bolus' && styles.modeTextActive]}>Bolus</Text>
            </Pressable>
            <Pressable style={[styles.modeButton, mode === 'basal' && styles.modeButtonActive]} onPress={selectBasalMode}>
              <Text style={[styles.modeText, mode === 'basal' && styles.modeTextActive]}>Basal</Text>
            </Pressable>
          </View>

          {mode === 'bolus' && (
            <View style={styles.field}>
              <Text style={styles.label}>Insulin (U)</Text>
              <TextInput
                style={styles.input}
                value={units}
                onChangeText={setUnits}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.text.placeholder}
                autoFocus
              />
            </View>
          )}

          {mode === 'basal' && (
            <>
              <View style={styles.modeRow}>
                {BASAL_TYPES.map((t) => (
                  <Pressable
                    key={t.value}
                    style={[styles.typeButton, basalType === t.value && styles.modeButtonActive]}
                    onPress={() => setBasalType(t.value)}
                  >
                    <Text style={[styles.modeText, basalType === t.value && styles.modeTextActive]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>

              {isOtherBasal && (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Name</Text>
                    <TextInput
                      style={styles.input}
                      value={basalCustomName}
                      onChangeText={setBasalCustomName}
                      placeholder="e.g. Toujeo"
                      placeholderTextColor={colors.text.placeholder}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Duration (hours) — for prediction math</Text>
                    <TextInput
                      style={styles.input}
                      value={basalCustomDuration}
                      onChangeText={setBasalCustomDuration}
                      keyboardType="decimal-pad"
                      placeholder="24"
                      placeholderTextColor={colors.text.placeholder}
                    />
                  </View>
                </>
              )}

              <View style={styles.field}>
                <Text style={styles.label}>Units</Text>
                <TextInput
                  style={styles.input}
                  value={basalUnits}
                  onChangeText={setBasalUnits}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.text.placeholder}
                />
              </View>
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={clear}>
              <Text style={styles.buttonText}>Clear</Text>
            </Pressable>
            <Pressable style={[styles.button, saveDisabled && styles.buttonDisabled]} disabled={saveDisabled} onPress={handleSave}>
              {submitting ? <ActivityIndicator color={colors.text.inverse} /> : <Text style={styles.buttonText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  radius: ReturnType<typeof useTheme>['radius'],
  spacing: ReturnType<typeof useTheme>['spacing'],
) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
    },
    sheet: {
      backgroundColor: colors.bg.primary,
      borderRadius: radius.lg,
      padding: spacing.xl,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.base,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
    },
    modeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.base,
    },
    modeButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: radius.md,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: colors.bg.primary,
    },
    typeButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: radius.md,
      paddingVertical: 10,
      paddingHorizontal: 2,
      alignItems: 'center',
      backgroundColor: colors.bg.primary,
    },
    modeButtonActive: {
      borderColor: colors.action.primaryBg,
      backgroundColor: colors.action.primaryBg,
    },
    modeText: {
      color: colors.text.secondary,
      fontWeight: '600',
      fontSize: 13,
    },
    modeTextActive: {
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
    error: {
      color: colors.status.danger,
      fontSize: 14,
      marginBottom: spacing.md,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    button: {
      flex: 1,
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
  });
}
