import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { runPrediction, type PredictionResult } from '../lib/oref/runPrediction';
import { colors, spacing } from '../lib/theme';

interface PredictionCalloutProps {
  onPress: () => void; // opens the full PredictionModal for the derivation
  refreshToken: number; // bump to force a re-check (e.g. after logging something)
}

// Simplified, always-visible summary under the Dashboard glucose graph —
// per the spec ("Predictions should have a callout under the main
// glucose graph; simplified for user digestibility"). Full derivation
// still lives in PredictionModal, opened by tapping this callout.
export function PredictionCallout({ onPress, refreshToken }: PredictionCalloutProps) {
  const [result, setResult] = useState<PredictionResult | null>(null);

  const check = useCallback(() => {
    runPrediction()
      .then(setResult)
      .catch(() => setResult(null));
  }, []);

  useEffect(() => {
    check();
  }, [check, refreshToken]);

  // Nothing useful to show yet — don't clutter the dashboard with a
  // permanent "no data" line for a fresh install.
  if (result === null || result.status === 'no-glucose-data') return null;

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

const styles = StyleSheet.create({
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
