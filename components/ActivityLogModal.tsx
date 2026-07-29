import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DuplicateActivityError, insertActivity, type ActivityIntensity } from '../lib/db/activities';
import { colors, radius, spacing } from '../lib/theme';

interface ActivityLogModalProps {
  visible: boolean;
  onClose: () => void;
  onLogged: () => void;
}

const INTENSITIES: { value: ActivityIntensity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'med', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export function ActivityLogModal({ visible, onClose, onLogged }: ActivityLogModalProps) {
  const [intensity, setIntensity] = useState<ActivityIntensity>('low');
  const [duration, setDuration] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => {
    setIntensity('low');
    setDuration('');
    setError(null);
  }, []);

  const commit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const durationNum = parseFloat(duration);
      await insertActivity({
        intensity,
        durationMinutes: Number.isFinite(durationNum) && durationNum > 0 ? durationNum : null,
        loggedAt: new Date().toISOString(),
      });
      clear();
      onLogged();
      onClose();
    } catch (e) {
      if (e instanceof DuplicateActivityError) {
        setError('That looks like a duplicate of what you just logged — not saved again.');
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSubmitting(false);
    }
  }, [intensity, duration, clear, onLogged, onClose]);

  const handleSave = useCallback(() => {
    Alert.alert('Log activity?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log', onPress: commit },
    ]);
  }, [commit]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Activity</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.text.primary} />
            </Pressable>
          </View>

          <Text style={styles.label}>Intensity</Text>
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

          <View style={styles.field}>
            <Text style={styles.label}>Duration (minutes)</Text>
            <TextInput
              style={styles.input}
              value={duration}
              onChangeText={setDuration}
              keyboardType="number-pad"
              placeholder="—"
              placeholderTextColor={colors.text.placeholder}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={clear}>
              <Text style={styles.buttonText}>Clear</Text>
            </Pressable>
            <Pressable style={[styles.button, submitting && styles.buttonDisabled]} disabled={submitting} onPress={handleSave}>
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
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
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
