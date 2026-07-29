import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActivityLogModal } from '../components/ActivityLogModal';
import { BasalDoseModal } from '../components/BasalDoseModal';
import { BleMeterModal } from '../components/BleMeterModal';
import { BolusWizardCard } from '../components/BolusWizardCard';
import { CarbsLogModal } from '../components/CarbsLogModal';
import { GlucoseChart, type ChartMarker } from '../components/GlucoseChart';
import { InsulinLogModal } from '../components/InsulinLogModal';
import { NotesLogModal } from '../components/NotesLogModal';
import { PredictionCallout } from '../components/PredictionCallout';
import { PredictionModal } from '../components/PredictionModal';
import { Card } from '../components/ui/Card';
import { getRecentActivities } from '../lib/db/activities';
import { getRecentNoteEntries } from '../lib/db/noteEntries';
import { getRecentTreatments } from '../lib/db/treatments';
import { useGlucose } from '../lib/GlucoseContext';
import { arrowForDirection, bgColor, formatClockTime, isStale } from '../lib/glucose';
import { usePrediction } from '../lib/oref/usePrediction';
import { quickActionStyles } from '../lib/theme';
import { useTheme } from '../lib/ThemeContext';

const MARKER_FETCH_COUNT = 50;

export function DashboardScreen() {
  const { current, history, xdripStatus, xdripError, reportBleLiveReading, reportBleHistorySync } = useGlucose();
  const { colors, spacing, radius, iconSize, fontScale } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, fontScale), [colors, spacing, radius, fontScale]);

  const [bleModalVisible, setBleModalVisible] = useState(false);
  const [basalDoseVisible, setBasalDoseVisible] = useState(false);
  const [predictionVisible, setPredictionVisible] = useState(false);
  const [carbsVisible, setCarbsVisible] = useState(false);
  const [insulinVisible, setInsulinVisible] = useState(false);
  const [activityVisible, setActivityVisible] = useState(false);
  const [notesVisible, setNotesVisible] = useState(false);
  const [markers, setMarkers] = useState<ChartMarker[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);

  const prediction = usePrediction(refreshToken);

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

  // Shared refresh for anything that changes after a log action: chart
  // markers and the prediction callout/IOB-COB stat (a new treatment or
  // basal dose can change IOB/COB, which changes the suggestion).
  const refreshAfterLog = useCallback(() => {
    refetchMarkers();
    setRefreshToken((t) => t + 1);
  }, [refetchMarkers]);

  useFocusEffect(
    useCallback(() => {
      refreshAfterLog();
    }, [refreshAfterLog]),
  );

  const iobCob = prediction.result?.status === 'ok' ? prediction.result : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.welcome}>Welcome, User</Text>

      <Card style={styles.readingCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.label}>CGM — xDrip+</Text>
          {iobCob && (
            <View style={styles.iobCobRow}>
              <View style={styles.iobCobItem}>
                <Text style={styles.iobCobLabel}>IOB</Text>
                <Text style={styles.iobCobValue}>{iobCob.iob.toFixed(2)} U</Text>
              </View>
              <View style={styles.iobCobItem}>
                <Text style={styles.iobCobLabel}>COB</Text>
                <Text style={styles.iobCobValue}>{iobCob.mealCOB} g</Text>
              </View>
            </View>
          )}
        </View>

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
            <PredictionCallout
              onPress={() => setPredictionVisible(true)}
              result={prediction.result}
              error={prediction.error}
              checked={prediction.checked}
            />
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
            styles={styles}
            icon={<Ionicons name="nutrition-outline" size={iconSize.base} color={quickActionStyles.carbs.color} />}
          />
          <QuickActionButton
            label="Insulin"
            color={quickActionStyles.insulin.color}
            onPress={() => setInsulinVisible(true)}
            styles={styles}
            icon={<MaterialCommunityIcons name="needle" size={iconSize.base} color={quickActionStyles.insulin.color} />}
          />
          <QuickActionButton
            label="Activity"
            color={quickActionStyles.activity.color}
            onPress={() => setActivityVisible(true)}
            styles={styles}
            icon={<Ionicons name="walk-outline" size={iconSize.base} color={quickActionStyles.activity.color} />}
          />
          <QuickActionButton
            label="Notes"
            color={quickActionStyles.note.color}
            onPress={() => setNotesVisible(true)}
            styles={styles}
            icon={<Ionicons name="create-outline" size={iconSize.base} color={quickActionStyles.note.color} />}
          />
        </View>
      </Card>

      <BolusWizardCard currentBG={current?.sgv ?? null} onLogged={refreshAfterLog} />

      <View style={styles.actionsRow}>
        <Pressable style={styles.actionButton} onPress={() => setBleModalVisible(true)}>
          <Text style={styles.actionButtonText}>Connect meter</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => setBasalDoseVisible(true)}>
          <Text style={styles.actionButtonText}>Log Basal Dose</Text>
        </Pressable>
      </View>
      <View style={styles.actionsRow}>
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
      <BasalDoseModal visible={basalDoseVisible} onClose={() => setBasalDoseVisible(false)} />
      <PredictionModal visible={predictionVisible} onClose={() => setPredictionVisible(false)} />
      <CarbsLogModal visible={carbsVisible} onClose={() => setCarbsVisible(false)} onLogged={refreshAfterLog} />
      <InsulinLogModal visible={insulinVisible} onClose={() => setInsulinVisible(false)} onLogged={refreshAfterLog} />
      <ActivityLogModal visible={activityVisible} onClose={() => setActivityVisible(false)} onLogged={refreshAfterLog} />
      <NotesLogModal visible={notesVisible} onClose={() => setNotesVisible(false)} onLogged={refreshAfterLog} />
    </ScrollView>
  );
}

function QuickActionButton({
  label,
  color,
  icon,
  onPress,
  styles,
}: {
  label: string;
  color: string;
  icon: ReactNode;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable style={styles.quickActionButton} onPress={onPress}>
      {icon}
      <Text style={[styles.quickActionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  spacing: ReturnType<typeof useTheme>['spacing'],
  radius: ReturnType<typeof useTheme>['radius'],
  fontScale: number,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg.surface,
    },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: spacing.xl,
      paddingTop: 60,
      paddingBottom: 120,
      alignItems: 'center',
    },
    welcome: {
      width: '100%',
      fontSize: 22 * fontScale,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: spacing.base,
    },
    readingCard: {
      width: '100%',
      alignItems: 'center',
    },
    quickActionsCard: {
      width: '100%',
      marginTop: spacing.base,
    },
    cardHeaderRow: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    iobCobRow: {
      flexDirection: 'row',
      gap: spacing.base,
    },
    iobCobItem: {
      alignItems: 'flex-end',
    },
    iobCobLabel: {
      fontSize: 11 * fontScale,
      color: colors.text.quaternary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    iobCobValue: {
      fontSize: 15 * fontScale,
      fontWeight: '700',
      color: colors.text.primary,
    },
    cardTitle: {
      fontSize: 16 * fontScale,
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
      fontSize: 13 * fontScale,
      fontWeight: '600',
    },
    label: {
      fontSize: 14 * fontScale,
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
      fontSize: 96 * fontScale,
      fontWeight: 'bold',
    },
    arrow: {
      fontSize: 40 * fontScale,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 16,
    },
    unit: {
      fontSize: 20 * fontScale,
      color: colors.text.secondary,
      marginBottom: 12,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
    },
    detail: {
      fontSize: 16 * fontScale,
      color: colors.text.secondary,
    },
    staleBadge: {
      fontSize: 11 * fontScale,
      fontWeight: '700',
      color: colors.status.danger,
      borderWidth: 1,
      borderColor: colors.status.danger,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      letterSpacing: 0.5,
    },
    chartWrap: {
      width: '100%',
    },
    message: {
      fontSize: 18 * fontScale,
      color: colors.text.tertiary,
      textAlign: 'center',
    },
    error: {
      fontSize: 20 * fontScale,
      color: colors.status.danger,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    errorDetail: {
      fontSize: 14 * fontScale,
      color: colors.status.danger,
      marginBottom: 12,
      textAlign: 'center',
    },
    hint: {
      fontSize: 13 * fontScale,
      color: colors.text.tertiary,
      textAlign: 'center',
      lineHeight: 18,
    },
    xdripNote: {
      fontSize: 12 * fontScale,
      color: colors.status.danger,
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
      color: colors.text.inverse,
      fontWeight: '600',
      fontSize: 14 * fontScale,
    },
  });
}
