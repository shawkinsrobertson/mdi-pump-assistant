import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AgpChart } from '../components/AgpChart';
import { Card } from '../components/ui/Card';
import { getLatestInsight, type InsightRecord } from '../lib/db/insights';
import { getReadingsSince } from '../lib/db/glucoseReadings';
import type { GlucoseReading } from '../lib/glucose';
import type { InsightPayload } from '../lib/insights/insightPayload';
import { parseInsightContent } from '../lib/insights/parseInsightContent';
import { useSettings } from '../lib/settings';
import { runInsightGeneration } from '../lib/tasks/insightTask';
import { colors, radius, spacing, type ThemeColors } from '../lib/theme';
import { computeAgpBuckets, computeAgpSummary } from '../lib/trends/agp';
import { computeTimeInRange } from '../lib/trends/timeInRange';
import { TRENDS_WINDOWS, trendsWindowLabel, windowStartMs, type TrendsWindow } from '../lib/trends/window';
import { useTheme } from '../lib/ThemeContext';

// This one card uses useTheme() (light/dark/system, per the Display
// setting) rather than the static `colors` export the rest of this
// screen still uses — see lib/theme.ts's own header comment on Trends
// not being fully migrated yet. An AI-generated insight benefits from
// reading as a slightly distinct kind of content, so it gets its own
// style factory below instead of sharing the module-level `styles`,
// but it still follows the same light/dark preference as everything
// else in the app, not a hardcoded palette.
function formatInsightDateRange(payload: InsightPayload): string {
  const end = new Date(payload.generatedAt);
  const start = new Date(end.getTime() - payload.windowDays * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Colors the "N% in range" badge the same way the Time in Range card
// above already implicitly ranks it (>=70% target per the international
// consensus this app's default range is built on — see lib/settings.ts).
function tirBadgeStyle(inRangePct: number, themeColors: ThemeColors): { bg: string; text: string } {
  const color =
    inRangePct >= 70 ? themeColors.status.success : inRangePct >= 50 ? themeColors.status.warning : themeColors.status.danger;
  return { bg: withAlpha(color, 0.16), text: color };
}

// A rotating visual rhythm for scanning multiple patterns at a glance —
// NOT a severity ranking. The model's own confidence text (rendered
// separately beneath each observation) is the real signal; this doesn't
// attempt to re-derive clinical meaning from it.
function patternAccentColors(themeColors: ThemeColors): string[] {
  return [themeColors.status.danger, themeColors.status.warning, themeColors.accent.info];
}

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

export function TrendsScreen() {
  const [settings, , settingsLoaded] = useSettings();
  const { colors: themeColors, spacing: themeSpacing, radius: themeRadius, fontScale } = useTheme();
  const insightStyles = useMemo(
    () => makeInsightStyles(themeColors, themeSpacing, themeRadius, fontScale),
    [themeColors, themeSpacing, themeRadius, fontScale],
  );
  const [window, setWindow] = useState<TrendsWindow>(7);
  const [readings, setReadings] = useState<GlucoseReading[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summaryStat, setSummaryStat] = useState<SummaryStat>('median');
  const [latestInsight, setLatestInsight] = useState<InsightRecord | null>(null);
  const [insightLoaded, setInsightLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getLatestInsight()
        .then((record) => {
          if (cancelled) return;
          setLatestInsight(record);
          setInsightLoaded(true);
        })
        .catch(() => {
          if (cancelled) return;
          setInsightLoaded(true); // no stored insight yet is not an error state
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const handleGenerateInsights = useCallback(() => {
    setGenerating(true);
    setGenerateError(null);
    runInsightGeneration('manual')
      .then((didGenerate) => {
        if (!didGenerate) {
          setGenerateError('Add a webhook URL in Settings > Integrations first.');
          return;
        }
        return getLatestInsight().then(setLatestInsight);
      })
      .catch((e) => setGenerateError(e instanceof Error ? e.message : String(e)))
      .finally(() => setGenerating(false));
  }, []);

  const tir = useMemo(
    () => (readings ? computeTimeInRange(readings, settings.rangeLow, settings.rangeHigh) : null),
    [readings, settings.rangeLow, settings.rangeHigh],
  );
  const agpBuckets = useMemo(() => (readings ? computeAgpBuckets(readings) : null), [readings]);
  const agpSummary = useMemo(() => (readings ? computeAgpSummary(readings) : null), [readings]);
  const parsedInsight = useMemo(
    () => (latestInsight ? parseInsightContent(latestInsight.insight) : null),
    [latestInsight],
  );
  // insights.ts's `payload` column is typed `unknown` (it's an opaque JSON
  // blob from the DB layer's own point of view) but is always written by
  // buildInsightPayload() — see lib/tasks/insightTask.ts — so the shape
  // is trusted here rather than re-validated field by field.
  const insightPayload = useMemo(
    () => (latestInsight ? (latestInsight.payload as InsightPayload) : null),
    [latestInsight],
  );
  const tirBadge = useMemo(
    () => (insightPayload ? tirBadgeStyle(insightPayload.timeInRange.inRangePct, themeColors) : null),
    [insightPayload, themeColors],
  );
  const patternAccents = useMemo(() => patternAccentColors(themeColors), [themeColors]);

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

      <Card style={insightStyles.insightsCard}>
        {(!insightLoaded || !settingsLoaded) && (
          <>
            <Text style={insightStyles.insightsCardTitle}>Patterns and Insights</Text>
            <Text style={insightStyles.insightsMessage}>Loading…</Text>
          </>
        )}

        {insightLoaded && settingsLoaded && latestInsight === null && (
          <>
            <Text style={insightStyles.insightsCardTitle}>Patterns and Insights</Text>
            <Text style={insightStyles.insightsMessage}>
              No insights generated yet.{' '}
              {settings.insightsWebhookUrl ? '' : 'Add a webhook URL in Settings > Integrations, then '}
              tap below to generate one now.
            </Text>
          </>
        )}

        {insightLoaded && latestInsight !== null && parsedInsight && insightPayload && tirBadge && (
          <>
            {parsedInsight.structured ? (
              <>
                <View style={insightStyles.insightsTopRow}>
                  <Text style={insightStyles.insightsDateRange}>{formatInsightDateRange(insightPayload)}</Text>
                  <View style={[insightStyles.insightsBadge, { backgroundColor: tirBadge.bg }]}>
                    <Text style={[insightStyles.insightsBadgeText, { color: tirBadge.text }]}>
                      {insightPayload.timeInRange.inRangePct}% in range
                    </Text>
                  </View>
                </View>

                <Text style={insightStyles.insightsSummary}>{parsedInsight.structured.summary}</Text>

                {parsedInsight.structured.patterns.length > 0 && (
                  <>
                    <View style={insightStyles.insightsDivider} />
                    <Text style={insightStyles.insightsSectionTitle}>Patterns noticed</Text>
                    {parsedInsight.structured.patterns.map((p, i) => (
                      <View key={i} style={insightStyles.patternRow}>
                        <View
                          style={[
                            insightStyles.patternMarker,
                            { borderColor: patternAccents[i % patternAccents.length] },
                          ]}
                        />
                        <View style={insightStyles.patternTextCol}>
                          <Text style={insightStyles.patternObservation}>{p.observation}</Text>
                          {p.confidence && <Text style={insightStyles.patternConfidence}>{p.confidence}</Text>}
                        </View>
                      </View>
                    ))}
                  </>
                )}

                {parsedInsight.structured.considerations.length > 0 && (
                  <>
                    <View style={insightStyles.insightsDivider} />
                    <Text style={insightStyles.insightsSectionTitle}>Worth considering</Text>
                    {parsedInsight.structured.considerations.map((c, i) => (
                      <Text key={i} style={insightStyles.insightsBulletDark}>
                        • {c}
                      </Text>
                    ))}
                  </>
                )}

                {parsedInsight.structured.doctorDiscussionTopics.length > 0 && (
                  <>
                    <View style={insightStyles.insightsDivider} />
                    <View style={insightStyles.insightsSectionTitleRow}>
                      <Ionicons name="checkbox-outline" size={15} color={themeColors.text.secondary} />
                      <Text style={insightStyles.insightsSectionTitleInline}>Bring to your next visit</Text>
                    </View>
                    {parsedInsight.structured.doctorDiscussionTopics.map((t, i) => (
                      <Text key={i} style={insightStyles.insightsBulletDark}>
                        • {t}
                      </Text>
                    ))}
                  </>
                )}

                <View style={insightStyles.insightsDivider} />
                <Text style={insightStyles.insightsFooter}>
                  Not medical advice. Always talk to your care team about changes to your treatment.
                </Text>
              </>
            ) : (
              <Text style={insightStyles.insightsSummary}>{parsedInsight.fallbackText}</Text>
            )}
          </>
        )}

        {generateError && <Text style={insightStyles.insightsError}>{generateError}</Text>}

        <Pressable
          style={[insightStyles.insightsGenerateButton, generating && insightStyles.generateButtonDisabled]}
          disabled={generating}
          onPress={handleGenerateInsights}
        >
          {generating ? (
            <ActivityIndicator color={themeColors.text.inverse} />
          ) : (
            <Text style={insightStyles.insightsGenerateButtonText}>Generate Insights Now</Text>
          )}
        </Pressable>
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

// The Insights card's own style factory — computed per-render from
// useTheme() (see the component body) rather than built once at module
// scope like `styles` above, since it needs to actually change with the
// Display setting's light/dark/system preference.
function makeInsightStyles(themeColors: ThemeColors, themeSpacing: typeof spacing, themeRadius: typeof radius, fontScale: number) {
  return StyleSheet.create({
    insightsCard: {
      padding: themeSpacing.xl,
    },
    insightsCardTitle: {
      fontSize: 18 * fontScale,
      fontWeight: '700',
      marginBottom: 12,
      color: themeColors.text.primary,
    },
    insightsMessage: {
      fontSize: 14 * fontScale,
      color: themeColors.text.tertiary,
    },
    insightsError: {
      fontSize: 14 * fontScale,
      color: themeColors.status.danger,
      marginBottom: themeSpacing.sm,
    },
    insightsTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: themeSpacing.sm,
    },
    insightsDateRange: {
      fontSize: 13 * fontScale,
      color: themeColors.text.tertiary,
      fontWeight: '600',
    },
    insightsBadge: {
      borderRadius: themeRadius.full,
      paddingHorizontal: themeSpacing.sm,
      paddingVertical: 4,
    },
    insightsBadgeText: {
      fontSize: 12 * fontScale,
      fontWeight: '700',
    },
    insightsSummary: {
      fontSize: 15 * fontScale,
      color: themeColors.text.primary,
      lineHeight: 21,
    },
    insightsDivider: {
      height: 1,
      backgroundColor: themeColors.border.subtle,
      marginVertical: themeSpacing.md,
    },
    insightsSectionTitle: {
      fontSize: 13 * fontScale,
      fontWeight: '700',
      color: themeColors.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: themeSpacing.sm,
    },
    insightsSectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: themeSpacing.sm,
    },
    insightsSectionTitleInline: {
      fontSize: 13 * fontScale,
      fontWeight: '700',
      color: themeColors.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    patternRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: themeSpacing.sm,
      marginBottom: themeSpacing.md,
    },
    patternMarker: {
      width: 12,
      height: 12,
      borderRadius: 3,
      borderWidth: 2,
      marginTop: 3,
    },
    patternTextCol: {
      flex: 1,
    },
    patternObservation: {
      fontSize: 14 * fontScale,
      fontWeight: '600',
      color: themeColors.text.primary,
      lineHeight: 19,
    },
    patternConfidence: {
      fontSize: 12 * fontScale,
      color: themeColors.text.tertiary,
      marginTop: 2,
    },
    insightsBulletDark: {
      fontSize: 14 * fontScale,
      color: themeColors.text.primary,
      lineHeight: 20,
      marginBottom: themeSpacing.sm,
    },
    insightsFooter: {
      fontSize: 11 * fontScale,
      color: themeColors.text.quaternary,
      lineHeight: 15,
    },
    insightsGenerateButton: {
      backgroundColor: themeColors.action.primaryBg,
      borderRadius: themeRadius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: themeSpacing.base,
    },
    generateButtonDisabled: {
      opacity: 0.6,
    },
    insightsGenerateButtonText: {
      color: themeColors.text.inverse,
      fontWeight: '600',
      fontSize: 14 * fontScale,
    },
  });
}
