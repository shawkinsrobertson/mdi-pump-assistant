import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { BleMeterModal } from '../components/BleMeterModal';
import { LogbookEntryModal } from '../components/LogbookEntryModal';
import { deleteBasalDose, getRecentBasalDoses, type BasalDoseRecord } from '../lib/db/basalDoses';
import { deleteTreatment, getRecentTreatments, type Treatment } from '../lib/db/treatments';
import { useGlucose } from '../lib/GlucoseContext';
import { logEntryId, logEntryTime, type LogEntry } from '../lib/logbookEntry';
import { colors, spacing } from '../lib/theme';

const RECENT_COUNT = 50;

function mergeEntries(treatments: Treatment[], basalDoses: BasalDoseRecord[]): LogEntry[] {
  const entries: LogEntry[] = [
    ...treatments.map((treatment): LogEntry => ({ kind: 'treatment', treatment })),
    ...basalDoses.map((dose): LogEntry => ({ kind: 'basal', dose })),
  ];
  return entries.sort((a, b) => logEntryTime(b).localeCompare(logEntryTime(a)));
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
    const label = dayLabel(new Date(logEntryTime(entry)), now);
    const last = sections[sections.length - 1];
    if (last && last.title === label) {
      last.data.push(entry);
    } else {
      sections.push({ title: label, data: [entry] });
    }
  }
  return sections;
}

function entryLabel(entry: LogEntry): string {
  return entry.kind === 'treatment' ? entry.treatment.eventType : `Basal — ${entry.dose.type}`;
}

function entryNotes(entry: LogEntry): string | null {
  return entry.kind === 'treatment' ? entry.treatment.notes : entry.dose.notes;
}

// Simple text search over type/date/notes — not a date-range picker (no
// calendar library is in the project yet), but "7/28" or "meal" both
// match, which covers the "search by type, particular date" ask.
function matchesQuery(entry: LogEntry, query: string): boolean {
  if (query.trim() === '') return true;
  const q = query.trim().toLowerCase();
  const haystack = [
    entryLabel(entry),
    entryNotes(entry) ?? '',
    new Date(logEntryTime(entry)).toLocaleString(),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function LogbookScreen() {
  const { reportBleLiveReading, reportBleHistorySync } = useGlucose();
  const [treatments, setTreatments] = useState<Treatment[] | null>(null);
  const [basalDoses, setBasalDoses] = useState<BasalDoseRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [bleModalVisible, setBleModalVisible] = useState(false);

  const refetch = useCallback(() => {
    setError(null);
    return Promise.all([getRecentTreatments(RECENT_COUNT), getRecentBasalDoses(RECENT_COUNT)])
      .then(([treatmentRows, basalDoseRows]) => {
        setTreatments(treatmentRows);
        setBasalDoses(basalDoseRows);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  // Refetch every time this tab gains focus (matches the old modal's
  // "refetch on open" behavior) rather than only once on mount, since
  // React Navigation keeps tab screens mounted in the background.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      refetch().catch(() => {
        // error already surfaced via state
      });
      return () => {
        cancelled = true;
      };
    }, [refetch]),
  );

  const filtered = useMemo(
    () => mergeEntries(treatments ?? [], basalDoses ?? []).filter((e) => matchesQuery(e, query)),
    [treatments, basalDoses, query],
  );

  const handleDelete = useCallback(
    (entry: LogEntry) => {
      Alert.alert('Delete entry?', 'This can\'t be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (entry.kind === 'treatment') {
                await deleteTreatment(entry.treatment.id);
              } else {
                await deleteBasalDose(entry.dose.id);
              }
              refetch();
            } catch (e) {
              Alert.alert('Couldn\'t delete', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ]);
    },
    [refetch],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Logbook</Text>

      <Pressable onPress={() => setBleModalVisible(true)} style={styles.connectMeterLink}>
        <Text style={styles.connectMeterText}>Connect meter</Text>
      </Pressable>

      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder="Search by type, date, or note…"
        placeholderTextColor={colors.text.placeholder}
      />

      {error && <Text style={styles.error}>Couldn't load entries: {error}</Text>}
      {!error && (treatments === null || basalDoses === null) && <Text style={styles.message}>Loading…</Text>}
      {!error && treatments?.length === 0 && basalDoses?.length === 0 && (
        <Text style={styles.message}>Nothing logged yet.</Text>
      )}
      {!error && treatments !== null && basalDoses !== null && filtered.length === 0 && query.trim() !== '' && (
        <Text style={styles.message}>No entries match "{query}".</Text>
      )}

      <SectionList
        sections={groupByDay(filtered)}
        keyExtractor={logEntryId}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionRule} />
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.eventType}>{entryLabel(item)}</Text>
              <Text style={styles.time}>{new Date(logEntryTime(item)).toLocaleString()}</Text>
            </View>
            <Text style={styles.detail}>
              {item.kind === 'treatment'
                ? [
                    item.treatment.insulin != null ? `${item.treatment.insulin} U` : null,
                    item.treatment.carbs != null ? `${item.treatment.carbs} g carbs` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : `${item.dose.units} U`}
            </Text>
            {entryNotes(item) && <Text style={styles.noteText}>{entryNotes(item)}</Text>}
            <View style={styles.actionsRow}>
              <Pressable onPress={() => setEditingEntry(item)}>
                <Text style={styles.actionLink}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => handleDelete(item)}>
                <Text style={[styles.actionLink, styles.deleteLink]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />

      <LogbookEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={refetch} />
      <BleMeterModal
        visible={bleModalVisible}
        onClose={() => setBleModalVisible(false)}
        onLiveReading={reportBleLiveReading}
        onHistorySync={(readings) => {
          reportBleHistorySync(readings);
          refetch();
        }}
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
    marginBottom: spacing.sm,
    color: colors.text.primary,
  },
  connectMeterLink: {
    marginBottom: spacing.base,
  },
  connectMeterText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brand,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smMd,
    fontSize: 15,
    color: colors.text.primary,
    marginBottom: spacing.base,
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
  noteText: {
    fontSize: 13,
    color: colors.text.tertiary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.base,
    marginTop: spacing.sm,
  },
  actionLink: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  deleteLink: {
    color: colors.status.danger,
  },
});
