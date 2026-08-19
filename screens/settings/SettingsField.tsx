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
  autoCapitalize,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  last?: boolean;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
  // URL/token-style fields (Nightscout URL/token, the insights webhook
  // URL) want 'none' — the default 'sentences' auto-capitalizes the
  // first character, which silently corrupts a case-sensitive token.
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  // For the Nightscout API token — a real credential, unlike this
  // screen's other fields, worth masking from shoulder-surfing the same
  // way any password field would be.
  secureTextEntry?: boolean;
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
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
      />
    </View>
  );
}
