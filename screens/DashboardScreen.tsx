import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BasalDoseModal } from '../components/BasalDoseModal';
import { BleMeterModal } from '../components/BleMeterModal';
import { GlucoseChart } from '../components/GlucoseChart';
import { PredictionModal } from '../components/PredictionModal';
import { QuickLogModal } from '../components/QuickLogModal';
import { Card } from '../components/ui/Card';
import { useGlucose } from '../lib/GlucoseContext';
import { arrowForDirection, bgColor, formatClockTime, isStale } from '../lib/glucose';
import { colors, radius, spacing } from '../lib/theme';

export function DashboardScreen() {
  const { current, history, xdripStatus, xdripError, reportBleLiveReading, reportBleHistorySync } = useGlucose();
  const [bleModalVisible, setBleModalVisible] = useState(false);
  const [quickLogVisible, setQuickLogVisible] = useState(false);
  const [basalDoseVisible, setBasalDoseVisible] = useState(false);
  const [predictionVisible, setPredictionVisible] = useState(false);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.readingCard}>
        <Text style={styles.label}>CGM — xDrip+</Text>

        {current === null && xdripStatus === 'loading' && <ActivityIndicator size="large" color={colors.text.label} />}

        {current !== null && (
          <>
            <View style={styles.headerRow}>
              <Text style={[styles.glucose, { color: bgColor(current.sgv) }]}>{current.sgv}</Text>
              <Text style={styles.arrow}>{arrowForDirection(current.direction)}</Text>
            </View>
            <Text style={styles.unit}>mg/dL</Text>
            <View style={styles.statusRow}>
              <Text style={styles.detail}>{formatClockTime(current.date)}</Text>
              {isStale(current) && <Text style={styles.staleBadge}>STALE</Text>}
            </View>

            <View style={styles.chartWrap}>
              <GlucoseChart history={history} />
            </View>
          </>
        )}

        {current === null && xdripStatus === 'no-data' && (
          <Text style={styles.message}>No recent CGM data from xDrip+.</Text>
        )}

        {current === null && xdripStatus === 'error' && (
          <>
            <Text style={styles.error}>Failed to reach xDrip+</Text>
            <Text style={styles.errorDetail}>{xdripError}</Text>
            <Text style={styles.hint}>
              If this URL works in the phone browser but not here, check that
              usesCleartextTraffic is enabled in app.json and rebuild the dev
              client.
            </Text>
          </>
        )}

        {current !== null && xdripStatus === 'error' && (
          <Text style={styles.xdripNote}>xDrip+ poll failing: {xdripError}</Text>
        )}
      </Card>

      <View style={styles.actionsRow}>
        <Pressable style={styles.actionButton} onPress={() => setQuickLogVisible(true)}>
          <Text style={styles.actionButtonText}>Quick Log</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => setBleModalVisible(true)}>
          <Text style={styles.actionButtonText}>Connect meter</Text>
        </Pressable>
      </View>
      <View style={styles.actionsRow}>
        <Pressable style={styles.actionButton} onPress={() => setBasalDoseVisible(true)}>
          <Text style={styles.actionButtonText}>Log Basal Dose</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => setPredictionVisible(true)}>
          <Text style={styles.actionButtonText}>Prediction</Text>
        </Pressable>
      </View>

      <BleMeterModal
        visible={bleModalVisible}
        onClose={() => setBleModalVisible(false)}
        onLiveReading={reportBleLiveReading}
        onHistorySync={reportBleHistorySync}
      />
      <QuickLogModal
        visible={quickLogVisible}
        onClose={() => setQuickLogVisible(false)}
        currentBG={current?.sgv ?? null}
      />
      <BasalDoseModal visible={basalDoseVisible} onClose={() => setBasalDoseVisible(false)} />
      <PredictionModal visible={predictionVisible} onClose={() => setPredictionVisible(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.surface,
  },
  content: {
    padding: spacing.xl,
    paddingTop: 60,
    paddingBottom: 120,
    alignItems: 'center',
  },
  readingCard: {
    width: '100%',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    color: colors.text.quaternary,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  glucose: {
    fontSize: 96,
    fontWeight: 'bold',
  },
  arrow: {
    fontSize: 40,
    fontWeight: '600',
    color: '#111',
    marginTop: 16,
  },
  unit: {
    fontSize: 20,
    color: '#555',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  detail: {
    fontSize: 16,
    color: '#555',
  },
  staleBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    letterSpacing: 0.5,
  },
  chartWrap: {
    width: '100%',
  },
  message: {
    fontSize: 18,
    color: '#888',
    textAlign: 'center',
  },
  error: {
    fontSize: 20,
    color: '#c00',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 14,
    color: '#c00',
    marginBottom: 12,
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    lineHeight: 18,
  },
  xdripNote: {
    fontSize: 12,
    color: '#c00',
    textAlign: 'center',
    marginTop: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  actionButton: {
    backgroundColor: colors.action.primaryBg,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
