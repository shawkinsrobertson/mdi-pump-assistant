import { Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { useSettingsStyles } from './useSettingsStyles';

export function SettingsField({
  label,
  value,
  onChangeText,
  last,
  keyboardType = 'decimal-pad',
  placeholder = '—',
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  last?: boolean;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  const styles = useSettingsStyles();
  return (
    <View style={[styles.field, last && styles.fieldLast]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.text.placeholder}
      />
    </View>
  );
}
