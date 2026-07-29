import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DuplicateTreatmentError, insertTreatment } from '../lib/db/treatments';
import { colors, radius, spacing } from '../lib/theme';

interface CarbsLogModalProps {
  visible: boolean;
  onClose: () => void;
  onLogged: () => void;
}

// Simple Quick Action: log a carb count with no bolus calculation —
// distinct from the existing "Bolus Wizard" flow (QuickLogModal), which
// computes a suggested insulin dose. Stored as a Meal Bolus treatment
// with insulin left null, same schema the wizard already writes to.
export function CarbsLogModal({ visible, onClose, onLogged }: CarbsLogModalProps) {
  const [carbs, setCarbs] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => {
    setCarbs('');
    setError(null);
  }, []);

  const commit = useCallback(async () => {
    const carbsNum = parseFloat(carbs);
    if (!Number.isFinite(carbsNum) || carbsNum <= 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await insertTreatment({
        eventType: 'Meal Bolus',
        insulin: null,
        carbs: carbsNum,
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
  }, [carbs, clear, onLogged, onClose]);

  const handleSave = useCallback(() => {
    Alert.alert('Log carbs?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log', onPress: commit },
    ]);
  }, [commit]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Carbs</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.text.primary} />
            </Pressable>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Carbs (g)</Text>
            <TextInput
              style={styles.input}
              value={carbs}
              onChangeText={setCarbs}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.text.placeholder}
              autoFocus
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={clear}>
              <Text style={styles.buttonText}>Clear</Text>
            </Pressable>
            <Pressable
              style={[styles.button, submitting && styles.buttonDisabled]}
              disabled={submitting || parseFloat(carbs) <= 0 || !carbs}
              onPress={handleSave}
            >
              {submitting ? <ActivityIndicator color={colors.text.inverse} /> : <Text style={styles.buttonText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
