import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getReadingsSince } from '../lib/db/glucoseReadings';
import { useSettings } from '../lib/settings';
import { computeTimeInRange, type TimeInRangeResult } from '../lib/trends/timeInRange';
import { TRENDS_WINDOWS, trendsWindowLabel, windowStartMs, type TrendsWindow } from '../lib/trends/window';

// Ambulatory Glucose Profile and Patterns/Insights are later work (see
// AGENTS.md) — this screen currently only has the Time in Range card.
export function TrendsScreen() {
  const [settings, , settingsLoaded] = useSettings();
  const [window, setWindow] = useState<TrendsWindow>(7);
  const [tir, setTir] = useState<TimeInRangeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!settingsLoaded) return;
      let cancelled = false;
      setError(null);
      const since = windowStartMs(window, new Date());
      getReadingsSince(since)
        .then((readings) => {
          if (cancelled) return;
          setTir(computeTimeInRange(readings, settings.rangeLow, settings.rangeHigh));
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : String(e));
        });
      return () => {
        cancelled = true;
      };
    }, [window, settingsLoaded, settings.rangeLow, settings.rangeHigh]),
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Trends</Text>

      <View style={styles.card}>
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
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ambulatory Profile</Text>
        <Text style={styles.message}>Coming soon.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Patterns and Insights</Text>
        <Text style={styles.message}>Needs at least 7 days of data — coming soon.</Text>
      </View>
    </ScrollView>
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
  card: {
    backgroundColor: '#f7f7f7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111',
  },
  message: {
    fontSize: 14,
    color: '#888',
  },
  error: {
    fontSize: 14,
    color: '#c00',
  },
  percentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  percentLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  belowLabel: {
    color: '#dc2626',
  },
  inRangeLabel: {
    color: '#16a34a',
  },
  aboveLabel: {
    color: '#d97706',
  },
  bar: {
    flexDirection: 'row',
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e5e5e5',
  },
  barSegment: {
    height: '100%',
  },
  belowSegment: {
    backgroundColor: '#dc2626',
  },
  inRangeSegment: {
    backgroundColor: '#16a34a',
  },
  aboveSegment: {
    backgroundColor: '#d97706',
  },
  rangeNote: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  toggleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  toggleButtonActive: {
    borderColor: '#111',
    backgroundColor: '#111',
  },
  toggleText: {
    color: '#555',
    fontWeight: '600',
    fontSize: 13,
  },
  toggleTextActive: {
    color: '#fff',
  },
});
