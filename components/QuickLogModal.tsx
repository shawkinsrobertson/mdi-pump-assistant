import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { computeBolusWizard } from '../lib/bolus';
import { DuplicateTreatmentError, getTreatmentsSince, insertTreatment, type EventType } from '../lib/db/treatments';
import { computeIOB } from '../lib/iob';
import { useSettings } from '../lib/settings';

interface QuickLogModalProps {
  visible: boolean;
  onClose: () => void;
  currentBG: number | null;
}

export function QuickLogModal({ visible, onClose, currentBG }: QuickLogModalProps) {
  const [settings, , settingsLoaded] = useSettings();
  const [logType, setLogType] = useState<EventType>('Meal Bolus');
  const [carbs, setCarbs] = useState('');
  const [insulinOverride, setInsulinOverride] = useState('');
  const [edited, setEdited] = useState(false);
  // null = not yet loaded / failed to load — must not be treated as 0.
  // A failed IOB fetch that silently defaulted to "no insulin on board"
  // would let the wizard suggest a dose that ignores insulin the user
  // may already have on board (AGENTS.md: never let a bad state
  // silently feed the calculator).
  const [iob, setIob] = useState<number | null>(null);
  const [iobError, setIobError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const settingsReady =
    settingsLoaded && settings.isf != null && settings.carbRatio != null && settings.targetBG != null && settings.dia != null;

  // Recompute IOB from the DIA-hour window every time the modal opens —
  // matches the wizard's "current" moment rather than a stale value from
  // whenever it was last opened.
  useEffect(() => {
    if (!visible || !settingsReady || settings.dia == null) return;
    let cancelled = false;
    setIob(null);
    setIobError(null);
    const since = new Date(Date.now() - settings.dia * 3_600_000).toISOString();
    getTreatmentsSince(since)
      .then((treatments) => {
        if (cancelled) return;
        setIob(computeIOB(treatments, settings.dia!, Date.now()));
      })
      .catch((e) => {
        if (cancelled) return;
        setIobError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [visible, settingsReady, settings.dia]);

  const carbsNum = parseFloat(carbs) || 0;

  const wizard = useMemo(() => {
    if (
      !settingsReady ||
      settings.isf == null ||
      settings.carbRatio == null ||
      settings.targetBG == null ||
      iob == null
    ) {
      return null;
    }
    return computeBolusWizard({
      carbs: carbsNum,
      currentBG,
      iob,
      carbRatio: settings.carbRatio,
      isf: settings.isf,
      targetBG: settings.targetBG,
      penIncrement: settings.penIncrement,
    });
  }, [settingsReady, settings, carbsNum, currentBG, iob]);

  const finalInsulin = edited ? parseFloat(insulinOverride) || 0 : (wizard?.suggested ?? 0);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await insertTreatment({
        eventType: logType,
        insulin: finalInsulin > 0 ? finalInsulin : null,
        carbs: carbsNum > 0 ? carbsNum : null,
        createdAt: new Date().toISOString(),
      });
      setCarbs('');
      setInsulinOverride('');
      setEdited(false);
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 2000);
    } catch (e) {
      if (e instanceof DuplicateTreatmentError) {
        setError('That looks like a duplicate of what you just logged — not saved again.');
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSubmitting(false);
    }
  }, [logType, finalInsulin, carbsNum]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Quick Log</Text>
          {confirmed && <Text style={styles.confirmed}>Logged ✓</Text>}
        </View>

        {!settingsReady ? (
          <Text style={styles.message}>
            Set your ISF, carb ratio, target BG, and DIA in Settings before using the bolus wizard.
          </Text>
        ) : (
          <>
            <View style={styles.toggleRow}>
              {(['Meal Bolus', 'Correction Bolus'] as const).map((t) => (
                <Pressable
                  key={t}
                  style={[styles.toggleButton, logType === t && styles.toggleButtonActive]}
                  onPress={() => setLogType(t)}
                >
                  <Text style={[styles.toggleText, logType === t && styles.toggleTextActive]}>
                    {t === 'Meal Bolus' ? 'Meal' : 'Correction'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Carbs (g)</Text>
              <TextInput
                style={styles.input}
                value={carbs}
                onChangeText={setCarbs}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Insulin to log (U)</Text>
              <TextInput
                style={styles.input}
                value={edited ? insulinOverride : (wizard?.suggested.toFixed(2) ?? '')}
                onChangeText={(text) => {
                  setEdited(true);
                  setInsulinOverride(text);
                }}
                keyboardType="decimal-pad"
                placeholder={wizard ? undefined : 'Enter manually'}
              />
              {edited && wizard && (
                <Pressable
                  onPress={() => {
                    setEdited(false);
                    setInsulinOverride('');
                  }}
                >
                  <Text style={styles.resetLink}>Reset to suggested</Text>
                </Pressable>
              )}
            </View>

            {wizard ? (
              <View style={styles.breakdown}>
                <Text style={styles.breakdownText}>
                  Current BG: {currentBG != null ? `${currentBG} mg/dL` : 'unavailable'}
                </Text>
                <Text style={styles.breakdownText}>
                  Meal {wizard.mealDose.toFixed(2)} U + correction {wizard.correction.toFixed(2)} U − IOB{' '}
                  {wizard.iob.toFixed(2)} U = {wizard.suggested.toFixed(2)} U
                </Text>
                {currentBG == null && (
                  <Text style={styles.breakdownNote}>No current BG available — correction term is 0.</Text>
                )}
              </View>
            ) : (
              <View style={styles.breakdown}>
                <Text style={styles.breakdownNote}>
                  {iobError
                    ? `Could not verify insulin already on board (${iobError}) — refusing to suggest a dose. Enter the dose manually if you want to log one.`
                    : 'Checking insulin already on board…'}
                </Text>
              </View>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.button, submitting && styles.buttonDisabled]}
              disabled={submitting || (carbsNum <= 0 && finalInsulin <= 0)}
              onPress={handleSubmit}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log</Text>}
            </Pressable>
          </>
        )}

        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={onClose}>
          <Text style={styles.buttonText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 60,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  confirmed: {
    color: '#16a34a',
    fontWeight: '600',
  },
  message: {
    fontSize: 14,
    color: '#555',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleButtonActive: {
    borderColor: '#111',
    backgroundColor: '#f0f0f0',
  },
  toggleText: {
    color: '#888',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#111',
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
  resetLink: {
    fontSize: 12,
    color: '#888',
    textDecorationLine: 'underline',
    marginTop: 4,
  },
  breakdown: {
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  breakdownText: {
    fontSize: 13,
    color: '#333',
  },
  breakdownNote: {
    fontSize: 12,
    color: '#c00',
    marginTop: 4,
  },
  error: {
    color: '#c00',
    fontSize: 13,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonSecondary: {
    backgroundColor: '#888',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
