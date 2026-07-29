import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActivityLogModal } from '../components/ActivityLogModal';
import { BasalDoseModal } from '../components/BasalDoseModal';
import { BleMeterModal } from '../components/BleMeterModal';
import { CarbsLogModal } from '../components/CarbsLogModal';
import { GlucoseChart, type ChartMarker } from '../components/GlucoseChart';
import { InsulinLogModal } from '../components/InsulinLogModal';
import { NotesLogModal } from '../components/NotesLogModal';
import { PredictionModal } from '../components/PredictionModal';
import { QuickLogModal } from '../components/QuickLogModal';
import { Card } from '../components/ui/Card';
import { getRecentActivities } from '../lib/db/activities';
import { getRecentNoteEntries } from '../lib/db/noteEntries';
import { getRecentTreatments } from '../lib/db/treatments';
import { useGlucose } from '../lib/GlucoseContext';
import { arrowForDirection, bgColor, formatClockTime, isStale } from '../lib/glucose';
import { colors, quickActionStyles, radius, spacing } from '../lib/theme';

const MARKER_FETCH_COUNT = 50;

export function DashboardScreen() {
  const { current, history, xdripStatus, xdripError, reportBleLiveReading, reportBleHistorySync } = useGlucose();
  const [bleModalVisible, setBleModalVisible] = useState(false);
  const [quickLogVisible, setQuickLogVisible] = useState(false);
  const [basalDoseVisible, setBasalDoseVisible] = useState(false);
  const [predictionVisible, setPredictionVisible] = useState(false);
  const [carbsVisible, setCarbsVisible] = useState(false);
  const [insulinVisible, setInsulinVisible] = useState(false);
  const [activityVisible, setActivityVisible] = useState(false);
  const [notesVisible, setNotesVisible] = useState(false);
  const [markers, setMarkers] = useState<ChartMarker[]>([]);

  const refetchMarkers = useCallback(() => {
    Promise.all([
      getRecentTreatments(MARKER_FETCH_COUNT),
      getRecentActivities(MARKER_FETCH_COUNT),
      getRecentNoteEntries(MARKER_FETCH_COUNT),
    ])
      .then(([treatments, activities, notes]) => {
        const treatmentMarkers: ChartMarker[] = treatments.map((t) => ({
          time: new Date(t.createdAt).getTime(),
          ...(t.carbs != null ? quickActionStyles.carbs : quickActionStyles.insulin),
        }));
        const activityMarkers: ChartMarker[] = activities.map((a) => ({
          time: new Date(a.loggedAt).getTime(),
          ...quickActionStyles.activity,
        }));
        const noteMarkers: ChartMarker[] = notes.map((n) => ({
          time: new Date(n.loggedAt).getTime(),
          ...quickActionStyles.note,
        }));
        setMarkers([...treatmentMarkers, ...activityMarkers, ...noteMarkers]);
      })
      .catch(() => {
        // Non-critical — markers just won't show for this refresh.
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refetchMarkers();
    }, [refetchMarkers]),
  );

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
              <GlucoseChart history={history} markers={markers} />
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

      <Card style={styles.quickActionsCard}>
        <Text style={styles.cardTitle}>Quick Actions</Text>
        <View style={styles.quickActionsRow}>
          <QuickActionButton
            label="Carbs"
            color={quickActionStyles.carbs.color}
            onPress={() => setCarbsVisible(true)}
            icon={<Ionicons name="nutrition-outline" size={iconSizeForQuickAction} color={quickActionStyles.carbs.color} />}
          />
          <QuickActionButton
            label="Insulin"
            color={quickActionStyles.insulin.color}
            onPress={() => setInsulinVisible(true)}
            icon={<MaterialCommunityIcons name="needle" size={iconSizeForQuickAction} color={quickActionStyles.insulin.color} />}
          />
          <QuickActionButton
            label="Activity"
            color={quickActionStyles.activity.color}
            onPress={() => setActivityVisible(true)}
            icon={<Ionicons name="walk-outline" size={iconSizeForQuickAction} color={quickActionStyles.activity.color} />}
          />
          <QuickActionButton
            label="Notes"
            color={quickActionStyles.note.color}
            onPress={() => setNotesVisible(true)}
            icon={<Ionicons name="create-outline" size={iconSizeForQuickAction} color={quickActionStyles.note.color} />}
          />
        </View>
      </Card>

      <View style={styles.actionsRow}>
        <Pressable style={styles.actionButton} onPress={() => setQuickLogVisible(true)}>
          <Text style={styles.actionButtonText}>Bolus Wizard</Text>
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
        onLogged={refetchMarkers}
      />
      <BasalDoseModal visible={basalDoseVisible} onClose={() => setBasalDoseVisible(false)} />
      <PredictionModal visible={predictionVisible} onClose={() => setPredictionVisible(false)} />
      <CarbsLogModal visible={carbsVisible} onClose={() => setCarbsVisible(false)} onLogged={refetchMarkers} />
      <InsulinLogModal visible={insulinVisible} onClose={() => setInsulinVisible(false)} onLogged={refetchMarkers} />
      <ActivityLogModal visible={activityVisible} onClose={() => setActivityVisible(false)} onLogged={refetchMarkers} />
      <NotesLogModal visible={notesVisible} onClose={() => setNotesVisible(false)} onLogged={refetchMarkers} />
    </ScrollView>
  );
}

const iconSizeForQuickAction = 26;

function QuickActionButton({
  label,
  color,
  icon,
  onPress,
}: {
  label: string;
  color: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.quickActionButton} onPress={onPress}>
      {icon}
      <Text style={[styles.quickActionLabel, { color }]}>{label}</Text>
    </Pressable>
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
  quickActionsCard: {
    width: '100%',
    marginTop: spacing.base,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickActionButton: {
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: '600',
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
