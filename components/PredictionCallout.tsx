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
  // Distinct from "still loading" — a thrown error must never collapse
  // into the same silent-null state as "haven't checked yet", or a real
  // failure becomes invisible instead of surfaced (see AGENTS.md: never
  // let a bad state silently feed the calculator).
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const check = useCallback(() => {
    runPrediction()
      .then((r) => {
        setResult(r);
        setError(null);
      })
      .catch((e) => {
        setResult(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setChecked(true));
  }, []);

  useEffect(() => {
    check();
  }, [check, refreshToken]);

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
