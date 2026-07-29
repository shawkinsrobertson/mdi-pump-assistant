import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { getRecentBasalDoses, type BasalDoseRecord } from '../lib/db/basalDoses';
import { getRecentTreatments, type Treatment } from '../lib/db/treatments';
import { colors, spacing } from '../lib/theme';

const RECENT_COUNT = 50;

type LogEntry = { kind: 'treatment'; treatment: Treatment } | { kind: 'basal'; dose: BasalDoseRecord };

function timeOf(e: LogEntry): string {
  return e.kind === 'treatment' ? e.treatment.createdAt : e.dose.injectedAt;
}

function mergeEntries(treatments: Treatment[], basalDoses: BasalDoseRecord[]): LogEntry[] {
  const entries: LogEntry[] = [
    ...treatments.map((treatment): LogEntry => ({ kind: 'treatment', treatment })),
    ...basalDoses.map((dose): LogEntry => ({ kind: 'basal', dose })),
  ];
  return entries.sort((a, b) => timeOf(b).localeCompare(timeOf(a)));
}

function dayLabel(date: Date, today: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(today) - startOfDay(date)) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

// Entries already arrive sorted newest-first (mergeEntries); grouping
// preserves that order across day boundaries.
function groupByDay(entries: LogEntry[]): { title: string; data: LogEntry[] }[] {
  const now = new Date();
  const sections: { title: string; data: LogEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(new Date(timeOf(entry)), now);
    const last = sections[sections.length - 1];
    if (last && last.title === label) {
      last.data.push(entry);
    } else {
      sections.push({ title: label, data: [entry] });
    }
  }
  return sections;
}

export function LogbookScreen() {
  const [treatments, setTreatments] = useState<Treatment[] | null>(null);
  const [basalDoses, setBasalDoses] = useState<BasalDoseRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refetch every time this tab gains focus (matches the old modal's
  // "refetch on open" behavior) rather than only once on mount, since
  // React Navigation keeps tab screens mounted in the background.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setError(null);
      Promise.all([getRecentTreatments(RECENT_COUNT), getRecentBasalDoses(RECENT_COUNT)])
        .then(([treatmentRows, basalDoseRows]) => {
          if (cancelled) return;
          setTreatments(treatmentRows);
          setBasalDoses(basalDoseRows);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : String(e));
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Logbook</Text>

      {error && <Text style={styles.error}>Couldn't load entries: {error}</Text>}
      {!error && (treatments === null || basalDoses === null) && <Text style={styles.message}>Loading…</Text>}
      {!error && treatments?.length === 0 && basalDoses?.length === 0 && (
        <Text style={styles.message}>Nothing logged yet.</Text>
      )}

      <SectionList
        sections={groupByDay(mergeEntries(treatments ?? [], basalDoses ?? []))}
        keyExtractor={(e) => `${e.kind}:${e.kind === 'treatment' ? e.treatment.id : e.dose.id}`}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionRule} />
          </View>
        )}
        renderItem={({ item }) =>
          item.kind === 'treatment' ? (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.eventType}>{item.treatment.eventType}</Text>
                <Text style={styles.time}>{new Date(item.treatment.createdAt).toLocaleString()}</Text>
              </View>
              <Text style={styles.detail}>
                {item.treatment.insulin != null ? `${item.treatment.insulin} U` : null}
                {item.treatment.insulin != null && item.treatment.carbs != null ? ' · ' : null}
                {item.treatment.carbs != null ? `${item.treatment.carbs} g carbs` : null}
              </Text>
            </View>
          ) : (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.eventType}>Basal — {item.dose.type}</Text>
                <Text style={styles.time}>{new Date(item.dose.injectedAt).toLocaleString()}</Text>
              </View>
              <Text style={styles.detail}>{item.dose.units} U</Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    padding: spacing.xl,
    paddingTop: 60,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    color: colors.text.primary,
  },
  listContent: {
    paddingBottom: 120,
  },
  sectionHeader: {
    backgroundColor: colors.bg.primary,
    paddingTop: spacing.base,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'right',
    marginBottom: spacing.xs,
  },
  sectionRule: {
    height: 1,
    backgroundColor: colors.text.primary,
    marginBottom: spacing.xs,
  },
  message: {
    fontSize: 14,
    color: colors.text.tertiary,
    marginBottom: 12,
  },
  error: {
    fontSize: 14,
    color: colors.status.danger,
    marginBottom: 12,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eventType: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  time: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  detail: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
});
