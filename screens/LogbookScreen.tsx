import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { BleMeterModal } from '../components/BleMeterModal';
import { LogbookEntryModal } from '../components/LogbookEntryModal';
import { deleteActivity, getRecentActivities, type ActivityRecord } from '../lib/db/activities';
import { deleteBasalDose, getRecentBasalDoses, type BasalDoseRecord } from '../lib/db/basalDoses';
import { deleteNoteEntry, getRecentNoteEntries, type NoteEntryRecord } from '../lib/db/noteEntries';
import { deleteTreatment, getRecentTreatments, type Treatment } from '../lib/db/treatments';
import { useGlucose } from '../lib/GlucoseContext';
import { logEntryId, logEntryTime, type LogEntry } from '../lib/logbookEntry';
import { useTheme } from '../lib/ThemeContext';

const RECENT_COUNT = 50;

function mergeEntries(
  treatments: Treatment[],
  basalDoses: BasalDoseRecord[],
  activities: ActivityRecord[],
  notes: NoteEntryRecord[],
): LogEntry[] {
  const entries: LogEntry[] = [
    ...treatments.map((treatment): LogEntry => ({ kind: 'treatment', treatment })),
    ...basalDoses.map((dose): LogEntry => ({ kind: 'basal', dose })),
    ...activities.map((activity): LogEntry => ({ kind: 'activity', activity })),
    ...notes.map((note): LogEntry => ({ kind: 'note', note })),
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

const INTENSITY_LABELS: Record<ActivityRecord['intensity'], string> = { low: 'Low', med: 'Medium', high: 'High' };

function entryLabel(entry: LogEntry): string {
  switch (entry.kind) {
    case 'treatment':
      return entry.treatment.eventType;
    case 'basal':
      return `Basal — ${entry.dose.type === 'other' ? entry.dose.customName || 'other' : entry.dose.type}`;
    case 'activity':
      return `Activity — ${INTENSITY_LABELS[entry.activity.intensity]}`;
    case 'note':
      return 'Note';
  }
}

function entryDetail(entry: LogEntry): string {
  switch (entry.kind) {
    case 'treatment':
      return [
        entry.treatment.insulin != null ? `${entry.treatment.insulin} U` : null,
        entry.treatment.carbs != null ? `${entry.treatment.carbs} g carbs` : null,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'basal':
      return `${entry.dose.units} U`;
    case 'activity':
      return entry.activity.durationMinutes != null ? `${entry.activity.durationMinutes} min` : '';
    case 'note':
      return entry.note.text;
  }
}

// Only treatments/basal doses carry a separate "notes" annotation field —
// an activity has no notes field, and a standalone note entry's text is
// already shown as its detail line, not duplicated here.
function entryNotes(entry: LogEntry): string | null {
  if (entry.kind === 'treatment') return entry.treatment.notes;
  if (entry.kind === 'basal') return entry.dose.notes;
  return null;
}

// Simple text search over type/date/notes — not a date-range picker (no
// calendar library is in the project yet), but "7/28" or "meal" both
// match, which covers the "search by type, particular date" ask.
function matchesQuery(entry: LogEntry, query: string): boolean {
  if (query.trim() === '') return true;
  const q = query.trim().toLowerCase();
  const haystack = [
    entryLabel(entry),
    entryDetail(entry),
    entryNotes(entry) ?? '',
    new Date(logEntryTime(entry)).toLocaleString(),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function LogbookScreen() {
  const { colors, spacing } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing), [colors, spacing]);
  const { reportBleLiveReading, reportBleHistorySync } = useGlucose();
  const [treatments, setTreatments] = useState<Treatment[] | null>(null);
  const [basalDoses, setBasalDoses] = useState<BasalDoseRecord[] | null>(null);
  const [activities, setActivities] = useState<ActivityRecord[] | null>(null);
  const [notes, setNotes] = useState<NoteEntryRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [bleModalVisible, setBleModalVisible] = useState(false);

  const refetch = useCallback(() => {
    setError(null);
    return Promise.all([
      getRecentTreatments(RECENT_COUNT),
      getRecentBasalDoses(RECENT_COUNT),
      getRecentActivities(RECENT_COUNT),
      getRecentNoteEntries(RECENT_COUNT),
    ])
      .then(([treatmentRows, basalDoseRows, activityRows, noteRows]) => {
        setTreatments(treatmentRows);
        setBasalDoses(basalDoseRows);
        setActivities(activityRows);
        setNotes(noteRows);
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

  const loaded = treatments !== null && basalDoses !== null && activities !== null && notes !== null;

  const filtered = useMemo(
    () =>
      mergeEntries(treatments ?? [], basalDoses ?? [], activities ?? [], notes ?? []).filter((e) =>
        matchesQuery(e, query),
      ),
    [treatments, basalDoses, activities, notes, query],
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
              } else if (entry.kind === 'basal') {
                await deleteBasalDose(entry.dose.id);
              } else if (entry.kind === 'activity') {
                await deleteActivity(entry.activity.id);
              } else {
                await deleteNoteEntry(entry.note.id);
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
      {!error && !loaded && <Text style={styles.message}>Loading…</Text>}
      {!error && loaded && filtered.length === 0 && query.trim() === '' && (
        <Text style={styles.message}>Nothing logged yet.</Text>
      )}
      {!error && loaded && filtered.length === 0 && query.trim() !== '' && (
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
            {entryDetail(item) !== '' && <Text style={styles.detail}>{entryDetail(item)}</Text>}
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

function makeStyles(colors: ReturnType<typeof useTheme>['colors'], spacing: ReturnType<typeof useTheme>['spacing']) {
  return StyleSheet.create({
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
}
