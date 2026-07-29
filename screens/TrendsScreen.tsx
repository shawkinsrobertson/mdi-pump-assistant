import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AgpChart } from '../components/AgpChart';
import { Card } from '../components/ui/Card';
import { getReadingsSince } from '../lib/db/glucoseReadings';
import type { GlucoseReading } from '../lib/glucose';
import { useSettings } from '../lib/settings';
import { colors, radius, spacing } from '../lib/theme';
import { computeAgpBuckets, computeAgpSummary } from '../lib/trends/agp';
import { computeTimeInRange } from '../lib/trends/timeInRange';
import { TRENDS_WINDOWS, trendsWindowLabel, windowStartMs, type TrendsWindow } from '../lib/trends/window';

type SummaryStat = 'median' | 'mean' | 'stdDev' | 'estimatedA1c';

const SUMMARY_STAT_LABELS: Record<SummaryStat, string> = {
  median: 'Median',
  mean: 'Mean',
  stdDev: 'Std. Dev.',
  estimatedA1c: 'Est. A1c',
};

function formatSummaryValue(stat: SummaryStat, value: number): string {
  if (stat === 'estimatedA1c') return `${value.toFixed(1)}%`;
  return `${value.toFixed(1)} mg/dL`;
}

// Patterns/Insights (an LLM feature) is later work — see AGENTS.md.
export function TrendsScreen() {
  const [settings, , settingsLoaded] = useSettings();
  const [window, setWindow] = useState<TrendsWindow>(7);
  const [readings, setReadings] = useState<GlucoseReading[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summaryStat, setSummaryStat] = useState<SummaryStat>('median');

  useFocusEffect(
    useCallback(() => {
      if (!settingsLoaded) return;
      let cancelled = false;
      setError(null);
      const since = windowStartMs(window, new Date());
      getReadingsSince(since)
        .then((rows) => {
          if (cancelled) return;
          setReadings(rows);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : String(e));
        });
      return () => {
        cancelled = true;
      };
    }, [window, settingsLoaded]),
  );

  const tir = useMemo(
    () => (readings ? computeTimeInRange(readings, settings.rangeLow, settings.rangeHigh) : null),
    [readings, settings.rangeLow, settings.rangeHigh],
  );
  const agpBuckets = useMemo(() => (readings ? computeAgpBuckets(readings) : null), [readings]);
  const agpSummary = useMemo(() => (readings ? computeAgpSummary(readings) : null), [readings]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Trends</Text>
        <Pressable
          onPress={() => Alert.alert('Export', 'Clinician export is coming soon.')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Export"
        >
          <Ionicons name="share-outline" size={24} color={colors.text.primary} />
        </Pressable>
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Time in Range</Text>

        {error && <Text style={styles.error}>Couldn't load readings: {error}</Text>}

        {!error && tir === null && <Text style={styles.message}>Loading…</Text>}

        {!error && tir !== null && tir.count === 0 && (
          <Text style={styles.message}>No glucose readings in this window yet.</Text>
        )}

        {!error && tir !== null && tir.count > 0 && (
          <>
            <View style={styles.percentRow}>
              <Text style={[styles.percentLabel, styles.belowLabel]}>{tir.belowPct}%</Text>
              <Text style={[styles.percentLabel, styles.inRangeLabel]}>{tir.inRangePct}%</Text>
              <Text style={[styles.percentLabel, styles.aboveLabel]}>{tir.abovePct}%</Text>
            </View>
            <View style={styles.bar}>
              {tir.belowPct > 0 && <View style={[styles.barSegment, styles.belowSegment, { flex: tir.belowPct }]} />}
              {tir.inRangePct > 0 && (
                <View style={[styles.barSegment, styles.inRangeSegment, { flex: tir.inRangePct }]} />
              )}
              {tir.abovePct > 0 && <View style={[styles.barSegment, styles.aboveSegment, { flex: tir.abovePct }]} />}
            </View>
            <Text style={styles.rangeNote}>
              Range: {settings.rangeLow}–{settings.rangeHigh} mg/dL (adjustable in Settings)
            </Text>
          </>
        )}

        <View style={styles.toggleRow}>
          {TRENDS_WINDOWS.map((w) => (
            <Pressable
              key={String(w)}
              style={[styles.toggleButton, window === w && styles.toggleButtonActive]}
              onPress={() => setWindow(w)}
            >
              <Text style={[styles.toggleText, window === w && styles.toggleTextActive]}>
                {trendsWindowLabel(w)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Ambulatory Profile</Text>

        {!error && agpBuckets !== null && readings !== null && readings.length === 0 && (
          <Text style={styles.message}>No glucose readings in this window yet.</Text>
        )}

        {!error && agpBuckets !== null && readings !== null && readings.length > 0 && (
          <>
            <AgpChart buckets={agpBuckets} />
            {agpSummary && (
              <>
                <Text style={styles.summaryValue}>{formatSummaryValue(summaryStat, agpSummary[summaryStat])}</Text>
                <View style={styles.toggleRow}>
                  {(Object.keys(SUMMARY_STAT_LABELS) as SummaryStat[]).map((stat) => (
                    <Pressable
                      key={stat}
                      style={[styles.toggleButton, summaryStat === stat && styles.toggleButtonActive]}
                      onPress={() => setSummaryStat(stat)}
                    >
                      <Text style={[styles.toggleText, summaryStat === stat && styles.toggleTextActive]}>
                        {SUMMARY_STAT_LABELS[stat]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Patterns and Insights</Text>
        <Text style={styles.message}>Needs at least 7 days of data — coming soon.</Text>
      </Card>
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
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
  },
  card: {
    marginBottom: spacing.base,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: colors.text.primary,
  },
  message: {
    fontSize: 14,
    color: colors.text.tertiary,
  },
  error: {
    fontSize: 14,
    color: colors.status.danger,
  },
  percentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  percentLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  belowLabel: {
    color: colors.status.danger,
  },
  inRangeLabel: {
    color: colors.status.success,
  },
  aboveLabel: {
    color: colors.status.warning,
  },
  bar: {
    flexDirection: 'row',
    height: 16,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.border.muted,
  },
  barSegment: {
    height: '100%',
  },
  belowSegment: {
    backgroundColor: colors.status.danger,
  },
  inRangeSegment: {
    backgroundColor: colors.status.success,
  },
  aboveSegment: {
    backgroundColor: colors.status.warning,
  },
  rangeNote: {
    fontSize: 14,
    color: colors.text.tertiary,
    marginTop: 8,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent.info,
    textAlign: 'center',
    marginTop: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  toggleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.bg.primary,
  },
  toggleButtonActive: {
    borderColor: colors.action.primaryBg,
    backgroundColor: colors.action.primaryBg,
  },
  toggleText: {
    color: colors.text.secondary,
    fontWeight: '600',
    fontSize: 14,
  },
  toggleTextActive: {
    color: colors.text.inverse,
  },
});
