import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PredictionResult } from '../lib/oref/runPrediction';
import { runPrediction } from '../lib/oref/runPrediction';

interface PredictionModalProps {
  visible: boolean;
  onClose: () => void;
}

// Manual, on-demand trigger — matching the same "flag, don't guess" /
// on-demand-suggestion pattern already used by the bolus wizard in
// QuickLogModal, rather than a silent background alert.
export function PredictionModal({ visible, onClose }: PredictionModalProps) {
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(() => {
    setLoading(true);
    setError(null);
    setResult(null);
    runPrediction()
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (visible) check();
  }, [visible, check]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Prediction</Text>

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#333" />
          </View>
        )}

        {!loading && error && <Text style={styles.error}>Couldn't run prediction: {error}</Text>}

        {!loading && !error && result?.status === 'settings-incomplete' && (
          <Text style={styles.message}>
            Set your {result.missing.join(', ')} in Settings before running a prediction.
          </Text>
        )}

        {!loading && !error && result?.status === 'no-glucose-data' && (
          <Text style={styles.message}>No glucose history available yet — nothing to predict from.</Text>
        )}

        {!loading && !error && result?.status === 'ok' && (
          <>
            {!result.autosensInsufficientData && Math.abs(result.autosensRatio - 1) >= 0.05 && (
              <View style={styles.sensitivityBox}>
                <Text style={styles.sensitivityTitle}>
                  {result.autosensRatio < 1 ? 'Increased sensitivity detected' : 'Increased resistance detected'}
                </Text>
                <Text style={styles.sensitivityDetail}>
                  Ratio {result.autosensRatio.toFixed(2)} — predictions and suggestions below are using an adjusted
                  ISF of {result.autosensAdjustedISF} instead of your usual value. This can happen with recent
                  activity, illness, or other changes — not wired into your manual bolus wizard.
                </Text>
              </View>
            )}

            {result.carbsSuggested != null ? (
              <View style={styles.suggestionBox}>
                <Text style={styles.suggestionTitle}>Suggested: {result.carbsSuggested}g carbs</Text>
                <Text style={styles.suggestionDetail}>
                  Your fixed basal can't be reduced like a pump's temp basal — this covers ~
                  {result.mdiExcessInsulin}U of excess basal effect via your carb ratio.
                </Text>
              </View>
            ) : (
              <View style={styles.okBox}>
                <Text style={styles.okText}>No action suggested right now.</Text>
              </View>
            )}

            <View style={styles.detailBox}>
              <Text style={styles.detailRow}>
                Eventual BG: {result.eventualBG != null ? `${result.eventualBG} mg/dL` : 'unavailable'}
              </Text>
              <Text style={styles.detailRow}>IOB: {result.iob.toFixed(2)} U</Text>
              <Text style={styles.detailRow}>COB: {result.mealCOB} g</Text>
              <Text style={styles.detailRow}>Current basal (from logged doses): {result.currentBasal.toFixed(2)} U/hr</Text>
              {result.insufficientGlucoseForCOB && (
                <Text style={styles.warning}>
                  Not enough glucose history yet to estimate carb absorption — COB is showing as 0 until more
                  builds up.
                </Text>
              )}
              {result.autosensInsufficientData && (
                <Text style={styles.warning}>
                  Not enough glucose history yet (6h+ needed) to check for sensitivity changes.
                </Text>
              )}
            </View>

            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>Full derivation:</Text>
              <Text style={styles.reasonText}>{result.reason}</Text>
            </View>
          </>
        )}

        <Pressable style={[styles.button, loading && styles.buttonDisabled]} disabled={loading} onPress={check}>
          <Text style={styles.buttonText}>Refresh</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={onClose}>
          <Text style={styles.buttonText}>Close</Text>
        </Pressable>
      </ScrollView>
    </Modal>
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
    marginBottom: 16,
  },
  centered: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  message: {
    fontSize: 14,
    color: '#555',
  },
  error: {
    fontSize: 14,
    color: '#c00',
  },
  sensitivityBox: {
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  sensitivityTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: 6,
  },
  sensitivityDetail: {
    fontSize: 13,
    color: '#1e3a8a',
  },
  suggestionBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  suggestionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 6,
  },
  suggestionDetail: {
    fontSize: 13,
    color: '#78350f',
  },
  okBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  okText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#166534',
  },
  detailBox: {
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  detailRow: {
    fontSize: 13,
    color: '#333',
    marginBottom: 4,
  },
  warning: {
    fontSize: 12,
    color: '#c00',
    marginTop: 6,
  },
  reasonBox: {
    marginBottom: 16,
  },
  reasonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 17,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonSecondary: {
    backgroundColor: '#888',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
