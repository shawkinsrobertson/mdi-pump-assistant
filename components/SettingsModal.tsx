import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSettings } from '../lib/settings';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

function numOrNull(text: string): number | null {
  if (text.trim() === '') return null;
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const [settings, updateSettings, loaded] = useSettings();
  const [isf, setIsf] = useState('');
  const [carbRatio, setCarbRatio] = useState('');
  const [targetBG, setTargetBG] = useState('');
  const [dia, setDia] = useState('');
  const [penIncrement, setPenIncrement] = useState('1');

  useEffect(() => {
    if (!loaded) return;
    setIsf(settings.isf?.toString() ?? '');
    setCarbRatio(settings.carbRatio?.toString() ?? '');
    setTargetBG(settings.targetBG?.toString() ?? '');
    setDia(settings.dia?.toString() ?? '');
    setPenIncrement(settings.penIncrement.toString());
  }, [loaded, settings]);

  const handleSave = () => {
    updateSettings({
      isf: numOrNull(isf),
      carbRatio: numOrNull(carbRatio),
      targetBG: numOrNull(targetBG),
      dia: numOrNull(dia),
      penIncrement: numOrNull(penIncrement) ?? 1,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.hint}>
          Required for the bolus wizard. Never pre-filled with a "typical" value — enter your own.
        </Text>

        <Field label="ISF (correction factor, mg/dL per unit)" value={isf} onChangeText={setIsf} />
        <Field label="Carb ratio (grams per unit)" value={carbRatio} onChangeText={setCarbRatio} />
        <Field label="Target BG (mg/dL)" value={targetBG} onChangeText={setTargetBG} />
        <Field label="DIA — duration of insulin action (hours)" value={dia} onChangeText={setDia} />
        <Field label="Pen increment (units, e.g. 1 or 0.5)" value={penIncrement} onChangeText={setPenIncrement} />

        <Pressable style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>Save</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={onClose}>
          <Text style={styles.buttonText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="—"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: '#888',
    marginBottom: 20,
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
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonSecondary: {
    backgroundColor: '#888',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
