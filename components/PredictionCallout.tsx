import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/ThemeContext';
import type { PredictionResult } from '../lib/oref/runPrediction';

interface PredictionCalloutProps {
  onPress: () => void; // opens the full PredictionModal for the derivation
  result: PredictionResult | null;
  error: string | null;
  checked: boolean;
}

// Simplified, always-visible summary under the Dashboard glucose graph —
// per the spec ("Predictions should have a callout under the main
// glucose graph; simplified for user digestibility"). Full derivation
// still lives in PredictionModal, opened by tapping this callout.
// Purely presentational — see lib/oref/usePrediction.ts for the fetch,
// shared with the Dashboard IOB/COB stat so both read one call.
export function PredictionCallout({ onPress, result, error, checked }: PredictionCalloutProps) {
  const { colors, spacing } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing), [colors, spacing]);

  if (!checked) return null; // brief initial load only

  if (error) {
    return (
      <Pressable style={styles.row} onPress={onPress}>
        <Text style={styles.errorText}>Couldn't check prediction: {error}</Text>
      </Pressable>
    );
  }

  if (result === null) return null;

  if (result.status === 'no-glucose-data') {
    return (
      <View style={styles.row}>
        <Text style={styles.mutedText}>Not enough glucose history yet for a prediction.</Text>
      </View>
    );
  }

  if (result.status === 'settings-incomplete') {
    return (
      <Pressable style={styles.row} onPress={onPress}>
        <Text style={styles.mutedText}>Set {result.missing.join(', ')} in Settings to enable predictions.</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
      </Pressable>
    );
  }

  const hasSuggestion = result.carbsSuggested != null;

  return (
    <Pressable style={[styles.row, hasSuggestion && styles.rowSuggestion]} onPress={onPress}>
      <View style={styles.textWrap}>
        {hasSuggestion ? (
          <Text style={styles.suggestionText}>Suggested: {result.carbsSuggested}g carbs</Text>
        ) : (
          <Text style={styles.okText}>
            No action suggested{result.eventualBG != null ? ` — eventual BG ${result.eventualBG} mg/dL` : ''}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={hasSuggestion ? '#92400e' : colors.text.tertiary} />
    </Pressable>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors'], spacing: ReturnType<typeof useTheme>['spacing']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.smMd,
      paddingHorizontal: spacing.md,
      borderRadius: 8,
      backgroundColor: colors.bg.surface,
      marginTop: spacing.md,
      width: '100%',
    },
    rowSuggestion: {
      backgroundColor: '#fef3c7',
    },
    textWrap: {
      flex: 1,
    },
    mutedText: {
      fontSize: 13,
      color: colors.text.tertiary,
    },
    errorText: {
      fontSize: 13,
      color: colors.status.danger,
    },
    okText: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    suggestionText: {
      fontSize: 13,
      color: '#92400e',
      fontWeight: '700',
    },
  });
}
