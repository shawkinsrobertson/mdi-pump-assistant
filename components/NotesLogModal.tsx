import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DuplicateNoteEntryError, insertNoteEntry } from '../lib/db/noteEntries';
import { colors, radius, spacing } from '../lib/theme';

interface NotesLogModalProps {
  visible: boolean;
  onClose: () => void;
  onLogged: () => void;
}

// Voice entry (mic icon) on this field is planned but not yet built —
// needs a real speech-to-text native module (e.g. @react-native-voice/
// voice), which is its own dev-client rebuild risk. See AGENTS.md.
export function NotesLogModal({ visible, onClose, onLogged }: NotesLogModalProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => {
    setText('');
    setError(null);
  }, []);

  const commit = useCallback(async () => {
    if (text.trim() === '') return;
    setSubmitting(true);
    setError(null);
    try {
      await insertNoteEntry({ text: text.trim(), loggedAt: new Date().toISOString() });
      clear();
      onLogged();
      onClose();
    } catch (e) {
      if (e instanceof DuplicateNoteEntryError) {
        setError('That looks like a duplicate of what you just logged — not saved again.');
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSubmitting(false);
    }
  }, [text, clear, onLogged, onClose]);

  const handleSave = useCallback(() => {
    Alert.alert('Log note?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log', onPress: commit },
    ]);
  }, [commit]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Note</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.text.primary} />
            </Pressable>
          </View>

          <View style={styles.field}>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={text}
              onChangeText={setText}
              multiline
              placeholder="What's going on?"
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
              disabled={submitting || text.trim() === ''}
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
  input: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smMd,
    fontSize: 16,
    color: colors.text.primary,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
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
