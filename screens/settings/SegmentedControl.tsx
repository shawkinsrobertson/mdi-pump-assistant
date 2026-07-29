import { Pressable, Text, View } from 'react-native';
import { useSettingsStyles } from './useSettingsStyles';

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const styles = useSettingsStyles();
  return (
    <View style={styles.toggleRow}>
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          style={[styles.toggleButton, value === opt.value && styles.toggleButtonActive]}
          onPress={() => onChange(opt.value)}
        >
          <Text style={[styles.toggleText, value === opt.value && styles.toggleTextActive]}>{opt.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
