import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActivityLogModal } from '../components/ActivityLogModal';
import { BolusWizardCard } from '../components/BolusWizardCard';
import { CarbsLogModal } from '../components/CarbsLogModal';
import { CHART_RIGHT_PADDING_RATIO, GlucoseChart, type ChartMarker, type ChartPoint } from '../components/GlucoseChart';
import { InsulinLogModal } from '../components/InsulinLogModal';
import { NotesLogModal } from '../components/NotesLogModal';
import { PredictionCallout } from '../components/PredictionCallout';
import { PredictionModal } from '../components/PredictionModal';
import { Card } from '../components/ui/Card';
import { getRecentActivities } from '../lib/db/activities';
import { getReadingsSince } from '../lib/db/glucoseReadings';
import { getRecentNoteEntries } from '../lib/db/noteEntries';
import { getRecentTreatments } from '../lib/db/treatments';
import { useGlucose } from '../lib/GlucoseContext';
import { arrowForDirection, bgColor, formatDelta, formatMinutesAgo, isStale } from '../lib/glucose';
import { usePrediction } from '../lib/oref/usePrediction';
import { BASAL_REMINDER_DATA_TYPE } from '../lib/tasks/basalReminders';
import { quickActionStyle } from '../lib/theme';
import { useTheme } from '../lib/ThemeContext';

const MARKER_FETCH_COUNT = 50;

// Cycled by tapping the chart, per the user's request to make 6/12/24h
// views reachable without a separate control. The DB (not the poll-bounded
// in-memory `history` from GlucoseContext) is queried for whichever window
// is selected, since xDrip+'s own poll only ever fetches its most recent
// ~144 readings — see lib/db/glucoseReadings.ts's retention comment.
const CHART_WINDOWS_HOURS = [3, 6, 12, 24] as const;

// How far ahead to draw the dashed prediction line — a near-term lead-in
// rather than oref0's full internal projection (which runs out to 4h),
// since a forecast that far out stops being a useful "leading" indicator.
const PREDICTION_HORIZON_POINTS = 12; // 12 * 5min = 60 minutes past predBGs[0]

export function DashboardScreen() {
  const { current, xdripStatus, xdripError } = useGlucose();
  const { colors, spacing, iconSize, fontScale, display } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, fontScale), [colors, spacing, fontScale]);

  const [predictionVisible, setPredictionVisible] = useState(false);
  const [carbsVisible, setCarbsVisible] = useState(false);
  const [insulinVisible, setInsulinVisible] = useState(false);
  const [insulinInitialMode, setInsulinInitialMode] = useState<'bolus' | 'basal'>('bolus');
  const [activityVisible, setActivityVisible] = useState(false);
  const [notesVisible, setNotesVisible] = useState(false);
  const [markers, setMarkers] = useState<ChartMarker[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [windowHours, setWindowHours] = useState<(typeof CHART_WINDOWS_HOURS)[number]>(3);
  const [chartHistory, setChartHistory] = useState<ChartPoint[]>([]);

  // A basal reminder notification (see lib/tasks/basalReminders.ts) opens
  // this same Insulin modal straight into Basal mode instead of a
  // separate screen — tapping it never logs anything by itself, the
  // person still reviews and confirms here like any other entry.
  const openBasalFromReminder = useCallback(() => {
    setInsulinInitialMode('basal');
    setInsulinVisible(true);
  }, []);

  useEffect(() => {
    const isBasalReminder = (data: unknown) =>
      !!data && typeof data === 'object' && (data as Record<string, unknown>).type === BASAL_REMINDER_DATA_TYPE;

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && isBasalReminder(response.notification.request.content.data)) {
        openBasalFromReminder();
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (isBasalReminder(response.notification.request.content.data)) {
        openBasalFromReminder();
      }
    });
    return () => subscription.remove();
  }, [openBasalFromReminder]);

  const prediction = usePrediction(refreshToken);

  const cycleWindow = useCallback(() => {
    setWindowHours((h) => {
      const i = CHART_WINDOWS_HOURS.indexOf(h);
      return CHART_WINDOWS_HOURS[(i + 1) % CHART_WINDOWS_HOURS.length];
    });
  }, []);

  // Reads straight from the DB rather than GlucoseContext's in-memory
  // `history` — that buffer is truncated to xDrip+'s own poll size
  // (count=144) and can't reliably cover a 12h/24h window. Re-fetches
  // whenever the window changes or a new reading arrives (current.date
  // changing is the signal a poll landed).
  useEffect(() => {
    let cancelled = false;
    getReadingsSince(Date.now() - windowHours * 60 * 60 * 1000)
      .then((readings) => {
        if (cancelled) return;
        setChartHistory(readings.map((r) => ({ time: r.date, sgv: r.sgv })));
      })
      .catch(() => {
        // Non-critical — chart just won't update for this refresh.
      });
    return () => {
      cancelled = true;
    };
  }, [windowHours, current?.date]);

  const predicted = useMemo<ChartPoint[]>(() => {
    if (prediction.result?.status !== 'ok' || !prediction.result.predBGs || !current) return [];
    return prediction.result.predBGs.slice(0, PREDICTION_HORIZON_POINTS).map((sgv, i) => ({
      time: current.date + (i + 1) * 5 * 60 * 1000,
      sgv,
    }));
  }, [prediction.result, current]);

  const refetchMarkers = useCallback(() => {
    Promise.all([
      getRecentTreatments(MARKER_FETCH_COUNT),
      getRecentActivities(MARKER_FETCH_COUNT),
      getRecentNoteEntries(MARKER_FETCH_COUNT),
    ])
      .then(([treatments, activities, notes]) => {
        const treatmentMarkers: ChartMarker[] = treatments.map((t) => ({
          time: new Date(t.createdAt).getTime(),
          ...(t.carbs != null ? quickActionStyle(colors, 'carbs') : quickActionStyle(colors, 'insulin')),
        }));
        const activityMarkers: ChartMarker[] = activities.map((a) => ({
          time: new Date(a.loggedAt).getTime(),
          ...quickActionStyle(colors, 'activity'),
        }));
        const noteMarkers: ChartMarker[] = notes.map((n) => ({
          time: new Date(n.loggedAt).getTime(),
          ...quickActionStyle(colors, 'note'),
        }));
        setMarkers([...treatmentMarkers, ...activityMarkers, ...noteMarkers]);
      })
      .catch(() => {
        // Non-critical — markers just won't show for this refresh.
      });
  }, [colors]);

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
                {iobCob.cobPending ? (
                  <Text style={styles.iobCobValue}>— g</Text>
                ) : (
                  <Text style={styles.iobCobValue}>{iobCob.mealCOB} g</Text>
                )}
                {iobCob.cobPending && <Text style={styles.iobCobCaption}>waiting on CGM data</Text>}
              </View>
            </View>
          )}
        </View>

        {current === null && xdripStatus === 'loading' && <ActivityIndicator size="large" color={colors.text.label} />}

        {current !== null && (
          <>
            <View style={styles.readingBlock}>
              <View style={styles.headerRow}>
                <Text style={[styles.glucose, { color: bgColor(current.sgv, colors) }]}>{current.sgv}</Text>
                <View style={styles.arrowDeltaCol}>
                  <Text style={styles.arrow}>{arrowForDirection(current.direction)}</Text>
                  <Text style={styles.delta}>{formatDelta(current.delta)}</Text>
                </View>
              </View>
              <Text style={styles.unit}>mg/dL</Text>
            </View>

            <View style={styles.chartWrap}>
              <View style={styles.chartOverlayRow}>
                {isStale(current) && <Text style={styles.staleBadge}>STALE</Text>}
                <Text style={styles.minAgo}>{formatMinutesAgo(current.date)}</Text>
              </View>
              <GlucoseChart
                history={chartHistory}
                markers={markers}
                predicted={predicted}
                windowHours={windowHours}
                timeFormat={display.timeFormat}
                colors={colors}
                onPress={cycleWindow}
              />
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
            color={quickActionStyle(colors, 'carbs').color}
            onPress={() => setCarbsVisible(true)}
            styles={styles}
            icon={<Ionicons name="nutrition-outline" size={iconSize.base} color={quickActionStyle(colors, 'carbs').color} />}
          />
          <QuickActionButton
            label="Insulin"
            color={quickActionStyle(colors, 'insulin').color}
            onPress={() => setInsulinVisible(true)}
            styles={styles}
            icon={<MaterialCommunityIcons name="needle" size={iconSize.base} color={quickActionStyle(colors, 'insulin').color} />}
          />
          <QuickActionButton
            label="Activity"
            color={quickActionStyle(colors, 'activity').color}
            onPress={() => setActivityVisible(true)}
            styles={styles}
            icon={<Ionicons name="walk-outline" size={iconSize.base} color={quickActionStyle(colors, 'activity').color} />}
          />
          <QuickActionButton
            label="Notes"
            color={quickActionStyle(colors, 'note').color}
            onPress={() => setNotesVisible(true)}
            styles={styles}
            icon={<Ionicons name="create-outline" size={iconSize.base} color={quickActionStyle(colors, 'note').color} />}
          />
        </View>
      </Card>

      <BolusWizardCard currentBG={current?.sgv ?? null} onLogged={refreshAfterLog} />

      <PredictionModal visible={predictionVisible} onClose={() => setPredictionVisible(false)} />
      <CarbsLogModal visible={carbsVisible} onClose={() => setCarbsVisible(false)} onLogged={refreshAfterLog} />
      <InsulinLogModal
        visible={insulinVisible}
        onClose={() => {
          setInsulinVisible(false);
          setInsulinInitialMode('bolus');
        }}
        onLogged={refreshAfterLog}
        initialMode={insulinInitialMode}
      />
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
      alignItems: 'stretch',
    },
    readingBlock: {
      alignItems: 'flex-start',
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
    iobCobCaption: {
      fontSize: 10 * fontScale,
      color: colors.text.quaternary,
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
      // Deliberately smaller than the reference mockup's 96pt — the chart
      // is meant to be this card's focal point, not the number.
      fontSize: 60 * fontScale,
      fontWeight: 'bold',
    },
    arrowDeltaCol: {
      alignItems: 'flex-start',
      marginTop: 8,
    },
    arrow: {
      fontSize: 26 * fontScale,
      fontWeight: '600',
      color: colors.text.primary,
    },
    delta: {
      fontSize: 13 * fontScale,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    unit: {
      fontSize: 16 * fontScale,
      color: colors.text.secondary,
      marginBottom: 8,
      // The glucose number's line box has empty space below the digits
      // beyond their visible ink (ordinary font metrics, not a bug) — a
      // negative marginTop closes that down to a tight ~4px gap between
      // the number and "mg/dL" instead of the much larger gap the raw
      // line box would otherwise leave.
      marginTop: -12,
      // The "1" glyph has a lot of built-in left bearing (its ink sits
      // well right of the box edge), while "mg/dL"'s "m" doesn't —
      // pixel-aligning both at x=0 left "mg/dL" looking like it hangs out
      // further left than the number above it. This nudges it to match
      // the number's visual (not box) left edge instead.
      marginLeft: 5,
    },
    chartOverlayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 8,
      marginBottom: 4,
      // Matches the chart's own right-side SVG padding so "min ago" lines
      // up over the plotted line/bands, not the card's raw right edge
      // (which the plot itself never reaches).
      paddingRight: `${CHART_RIGHT_PADDING_RATIO * 100}%`,
    },
    minAgo: {
      fontSize: 13 * fontScale,
      color: colors.text.tertiary,
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
  });
}
