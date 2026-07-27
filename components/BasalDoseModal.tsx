import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DuplicateBasalDoseError, insertBasalDose } from '../lib/db/basalDoses';
import type { LongActingInsulinType } from '../lib/mdi/basalCurve';

interface BasalDoseModalProps {
  visible: boolean;
  onClose: () => void;
}

const TYPES: { value: LongActingInsulinType; label: string }[] = [
  { value: 'glargine', label: 'Glargine' },
  { value: 'detemir', label: 'Detemir' },
  { value: 'degludec', label: 'Degludec' },
];

export function BasalDoseModal({ visible, onClose }: BasalDoseModalProps) {
  const [type, setType] = useState<LongActingInsulinType>('glargine');
  const [units, setUnits] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const unitsNum = parseFloat(units) || 0;

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await insertBasalDose({ type, units: unitsNum, injectedAt: new Date().toISOString() });
      setUnits('');
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 2000);
    } catch (e) {
      if (e instanceof DuplicateBasalDoseError) {
        setError('That looks like a duplicate of what you just logged — not saved again.');
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSubmitting(false);
    }
  }, [type, unitsNum]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Log Basal Dose</Text>
          {confirmed && <Text style={styles.confirmed}>Logged ✓</Text>}
        </View>
        <Text style={styles.hint}>
          Logs a long-acting injection at the current time. Used to model your fixed basal effect —
          not a bolus.
        </Text>

        <View style={styles.toggleRow}>
          {TYPES.map((t) => (
            <Pressable
              key={t.value}
              style={[styles.toggleButton, type === t.value && styles.toggleButtonActive]}
              onPress={() => setType(t.value)}
            >
              <Text style={[styles.toggleText, type === t.value && styles.toggleTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Units</Text>
          <TextInput
            style={styles.input}
            value={units}
            onChangeText={setUnits}
            keyboardType="decimal-pad"
            placeholder="0"
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          disabled={submitting || unitsNum <= 0}
          onPress={handleSubmit}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log</Text>}
        </Pressable>
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
