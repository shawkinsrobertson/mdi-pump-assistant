import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { BleMeterModal } from '../components/BleMeterModal';
import { LogbookEntryModal } from '../components/LogbookEntryModal';
import { deleteActivity, getRecentActivities, type ActivityRecord } from '../lib/db/activities';
import { deleteBasalDose, getRecentBasalDoses, type BasalDoseRecord } from '../lib/db/basalDoses';
import { deleteReading, getRecentReadingsBySource } from '../lib/db/glucoseReadings';
import {
  deleteHealthActivity,
  deleteHealthNutrition,
  getRecentHealthActivities,
  getRecentHealthNutrition,
  type HealthActivityRecord,
  type HealthNutritionRecord,
} from '../lib/db/health';
import {
  deleteNightscoutTreatment,
  getRecentNightscoutTreatments,
  type NightscoutTreatmentRecord,
} from '../lib/db/nightscoutTreatments';
import { deleteNoteEntry, getRecentNoteEntries, type NoteEntryRecord } from '../lib/db/noteEntries';
import { deleteTreatment, getRecentTreatments, type Treatment } from '../lib/db/treatments';
import type { GlucoseReading } from '../lib/glucose';
import { useGlucose } from '../lib/GlucoseContext';
import { syncHealthData } from '../lib/health/sync';
import { logEntryId, logEntryTime, type LogEntry } from '../lib/logbookEntry';
import { isNightscoutConfigured, syncNightscoutTreatments } from '../lib/nightscout/sync';
import { useSettings } from '../lib/settings';
import { useTheme } from '../lib/ThemeContext';
import { useSwipeTabNavigation } from '../lib/useSwipeTabNavigation';

const RECENT_COUNT = 50;

// Source key GlucoseContext/useGlucoseSource tag Bluetooth meter readings
// with (see reportBleHistorySync's replaceSource('ble', ...)) — the only
// glucose source the Logbook surfaces as its own row type; see LogEntry's
// 'glucose' kind for why the continuous xDrip+ CGM feed doesn't.
const BLE_READING_SOURCE = 'ble';

function mergeEntries(
  treatments: Treatment[],
  basalDoses: BasalDoseRecord[],
  activities: ActivityRecord[],
  notes: NoteEntryRecord[],
  bleReadings: GlucoseReading[],
  healthActivities: HealthActivityRecord[],
  healthNutrition: HealthNutritionRecord[],
  nightscoutTreatments: NightscoutTreatmentRecord[],
): LogEntry[] {
  const entries: LogEntry[] = [
    ...treatments.map((treatment): LogEntry => ({ kind: 'treatment', treatment })),
    ...basalDoses.map((dose): LogEntry => ({ kind: 'basal', dose })),
    ...activities.map((activity): LogEntry => ({ kind: 'activity', activity })),
    ...notes.map((note): LogEntry => ({ kind: 'note', note })),
    ...bleReadings.map((reading): LogEntry => ({ kind: 'glucose', reading })),
    ...healthActivities.map((record): LogEntry => ({ kind: 'healthActivity', record })),
    ...healthNutrition.map((record): LogEntry => ({ kind: 'healthNutrition', record })),
    ...nightscoutTreatments.map((record): LogEntry => ({ kind: 'nightscoutTreatment', record })),
  ];
  // A closed-loop system (AndroidAPS/Loop/etc.) uploads its own Temp Basal
  // adjustments to Nightscout continuously — background algorithm activity
  // this app never drives (MDI users take a fixed daily long-acting dose;
  // see Settings > Account and Profile > Basal Schedule), not something
  // worth a Logbook row. Dropped unconditionally rather than left for the
  // person to filter out themselves every time.
  const withoutTempBasal = entries.filter(
    (e) => !(e.kind === 'nightscoutTreatment' && e.record.eventType === 'Temp Basal'),
  );
  return withoutTempBasal.sort((a, b) => logEntryTime(b).localeCompare(logEntryTime(a)));
}

function dayLabel(date: Date, today: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(today) - startOfDay(date)) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

// A synthetic Logbook row grouping a Nightscout "Correction Bolus" burst
// within one calendar hour into a single collapsible card — see
// groupSmbEntries below. This is purely a rendering concern of this
// screen (not a persisted concept), so it lives here rather than in
// lib/logbookEntry.ts's LogEntry union.
interface SmbGroupRow {
  kind: 'smbGroup';
  hourKey: string; // e.g. "2026-7-28-14" — stable per calendar hour
  hourStart: number; // epoch ms of the hour's start, for the card's label
  entries: NightscoutTreatmentRecord[]; // newest-first, same as everything else
}

type LogRow = LogEntry | SmbGroupRow;

function rowId(row: LogRow): string {
  return row.kind === 'smbGroup' ? `smbGroup:${row.hourKey}` : logEntryId(row);
}

function rowTime(row: LogRow): string {
  return row.kind === 'smbGroup' ? row.entries[0].createdAt : logEntryTime(row);
}

// Nightscout "Correction Bolus" entries are grouped one card per calendar
// hour — per the person's own domain framing, a Nightscout correction
// bolus *is* what's meant by "SMB" here (a closed-loop system can upload
// several an hour, which would otherwise flood the Logbook with
// near-identical rows). This app doesn't currently ingest the isSMB/
// automatic flag some uploaders send, so eventType is the only signal
// available — every other kind (including this app's own locally-logged
// Correction Bolus treatments) passes through ungrouped.
function groupSmbEntries(entries: LogEntry[]): LogRow[] {
  const other: LogEntry[] = [];
  const buckets = new Map<string, NightscoutTreatmentRecord[]>();
  const bucketOrder: string[] = [];
  for (const entry of entries) {
    if (entry.kind === 'nightscoutTreatment' && entry.record.eventType === 'Correction Bolus') {
      const created = new Date(entry.record.createdAt);
      const hourKey = `${created.getFullYear()}-${created.getMonth()}-${created.getDate()}-${created.getHours()}`;
      if (!buckets.has(hourKey)) {
        buckets.set(hourKey, []);
        bucketOrder.push(hourKey);
      }
      buckets.get(hourKey)!.push(entry.record);
    } else {
      other.push(entry);
    }
  }
  const groups: SmbGroupRow[] = bucketOrder.map((hourKey) => {
    const groupEntries = buckets.get(hourKey)!;
    const created = new Date(groupEntries[0].createdAt);
    const hourStart = new Date(
      created.getFullYear(),
      created.getMonth(),
      created.getDate(),
      created.getHours(),
    ).getTime();
    return { kind: 'smbGroup', hourKey, hourStart, entries: groupEntries };
  });
  const rows: LogRow[] = [...other, ...groups];
  return rows.sort((a, b) => rowTime(b).localeCompare(rowTime(a)));
}

// Rows already arrive sorted newest-first (mergeEntries + groupSmbEntries);
// grouping preserves that order across day boundaries.
function groupByDay(rows: LogRow[]): { title: string; data: LogRow[] }[] {
  const now = new Date();
  const sections: { title: string; data: LogRow[] }[] = [];
  for (const row of rows) {
    const label = dayLabel(new Date(rowTime(row)), now);
    const last = sections[sections.length - 1];
    if (last && last.title === label) {
      last.data.push(row);
    } else {
      sections.push({ title: label, data: [row] });
    }
  }
  return sections;
}

const INTENSITY_LABELS: Record<ActivityRecord['intensity'], string> = { low: 'Low', med: 'Medium', high: 'High' };

// Read-only imports (device meter readings, HealthKit/Health Connect,
// Nightscout) never get an Edit link — see LogEntry's own comment
// (lib/logbookEntry.ts) for why.
const IMPORTED_KINDS = new Set<LogEntry['kind']>(['glucose', 'healthActivity', 'healthNutrition', 'nightscoutTreatment']);

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
    case 'glucose':
      return 'Meter reading';
    case 'healthActivity':
      return entry.record.title;
    case 'healthNutrition':
      return 'Nutrition (imported)';
    case 'nightscoutTreatment':
      return `${entry.record.eventType ?? 'Treatment'} (Nightscout)`;
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
    case 'glucose':
      return `${entry.reading.sgv} mg/dL`;
    case 'healthActivity':
      return [
        entry.record.durationMinutes != null ? `${Math.round(entry.record.durationMinutes)} min` : null,
        entry.record.calories != null ? `${Math.round(entry.record.calories)} cal` : null,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'healthNutrition':
      return `${entry.record.carbsGrams} g carbs`;
    case 'nightscoutTreatment':
      return [
        entry.record.insulin != null ? `${entry.record.insulin} U` : null,
        entry.record.carbs != null ? `${entry.record.carbs} g carbs` : null,
      ]
        .filter(Boolean)
        .join(' · ');
  }
}

// Only treatments/basal doses carry a separate "notes" annotation field —
// an activity has no notes field, and a standalone note entry's text is
// already shown as its detail line, not duplicated here.
function entryNotes(entry: LogEntry): string | null {
  if (entry.kind === 'treatment') return entry.treatment.notes;
  if (entry.kind === 'basal') return entry.dose.notes;
  if (entry.kind === 'nightscoutTreatment') return entry.record.notes;
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

type FilterChip = 'basal' | 'correction' | 'carb' | 'note' | 'date';

const FILTER_CHIPS: { key: FilterChip; label: string }[] = [
  { key: 'basal', label: 'Basal' },
  { key: 'correction', label: 'Correction' },
  { key: 'carb', label: 'Carb' },
  { key: 'note', label: 'Note' },
  { key: 'date', label: 'Date' },
];

// "Date" is a fixed "today only" quick filter, not a date-range/calendar
// picker — no calendar library exists in this project yet (see
// matchesQuery's own comment above), and the other 4 chips are already
// simple one-tap booleans; this keeps all 5 consistent instead of "date"
// alone needing a whole picker UI to satisfy "chips ... that allow the
// user to quickly filter when tapped."
function matchesFilterChip(entry: LogEntry, filter: FilterChip, today: Date): boolean {
  switch (filter) {
    case 'basal':
      return entry.kind === 'basal';
    case 'correction':
      return (
        (entry.kind === 'treatment' && entry.treatment.eventType === 'Correction Bolus') ||
        (entry.kind === 'nightscoutTreatment' && entry.record.eventType === 'Correction Bolus')
      );
    case 'carb':
      return (
        (entry.kind === 'treatment' && entry.treatment.carbs != null) ||
        (entry.kind === 'nightscoutTreatment' && entry.record.carbs != null) ||
        entry.kind === 'healthNutrition'
      );
    case 'note':
      return entry.kind === 'note';
    case 'date':
      return dayLabel(new Date(logEntryTime(entry)), today) === 'Today';
  }
}

export function LogbookScreen({ navigation }: { navigation: NavigationProp<ParamListBase> }) {
  const { colors, spacing } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing), [colors, spacing]);
  const swipeHandlers = useSwipeTabNavigation(navigation);
  const { reportBleLiveReading, reportBleHistorySync } = useGlucose();
  const [settings] = useSettings();
  const [treatments, setTreatments] = useState<Treatment[] | null>(null);
  const [basalDoses, setBasalDoses] = useState<BasalDoseRecord[] | null>(null);
  const [activities, setActivities] = useState<ActivityRecord[] | null>(null);
  const [notes, setNotes] = useState<NoteEntryRecord[] | null>(null);
  const [bleReadings, setBleReadings] = useState<GlucoseReading[] | null>(null);
  const [healthActivities, setHealthActivities] = useState<HealthActivityRecord[] | null>(null);
  const [healthNutrition, setHealthNutrition] = useState<HealthNutritionRecord[] | null>(null);
  const [nightscoutTreatments, setNightscoutTreatments] = useState<NightscoutTreatmentRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<FilterChip>>(new Set());
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [bleModalVisible, setBleModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refetch = useCallback(() => {
    setError(null);
    return Promise.all([
      getRecentTreatments(RECENT_COUNT),
      getRecentBasalDoses(RECENT_COUNT),
      getRecentActivities(RECENT_COUNT),
      getRecentNoteEntries(RECENT_COUNT),
      getRecentReadingsBySource(BLE_READING_SOURCE, RECENT_COUNT),
      getRecentHealthActivities(RECENT_COUNT),
      getRecentHealthNutrition(RECENT_COUNT),
      getRecentNightscoutTreatments(RECENT_COUNT),
    ])
      .then(
        ([
          treatmentRows,
          basalDoseRows,
          activityRows,
          noteRows,
          bleReadingRows,
          healthActivityRows,
          healthNutritionRows,
          nightscoutTreatmentRows,
        ]) => {
          setTreatments(treatmentRows);
          setBasalDoses(basalDoseRows);
          setActivities(activityRows);
          setNotes(noteRows);
          setBleReadings(bleReadingRows);
          setHealthActivities(healthActivityRows);
          setHealthNutrition(healthNutritionRows);
          setNightscoutTreatments(nightscoutTreatmentRows);
        },
      )
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  // Pull-to-refresh: syncs HealthKit/Health Connect and Nightscout
  // treatments first (whichever the person has configured — see Settings
  // > Integrations), then always refetches every Logbook source. Same
  // "share the one sync function" reasoning as the background tasks and
  // Settings "Sync now" buttons — see lib/health/sync.ts's
  // syncHealthData/lib/nightscout/sync.ts's syncNightscoutTreatments. A
  // sync failure here is swallowed (best-effort, same as the background
  // tasks) rather than blocking the rest of the refresh — Settings >
  // Integrations is where sync errors actually surface.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        settings.healthSyncEnabled
          ? syncHealthData().catch((e) => console.error('Pull-to-refresh health sync failed:', e))
          : Promise.resolve(),
        isNightscoutConfigured(settings)
          ? syncNightscoutTreatments().catch((e) => console.error('Pull-to-refresh Nightscout sync failed:', e))
          : Promise.resolve(),
      ]);
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch, settings]);

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

  const loaded =
    treatments !== null &&
    basalDoses !== null &&
    activities !== null &&
    notes !== null &&
    bleReadings !== null &&
    healthActivities !== null &&
    healthNutrition !== null &&
    nightscoutTreatments !== null;

  const toggleFilter = useCallback((key: FilterChip) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const [expandedSmbGroups, setExpandedSmbGroups] = useState<Set<string>>(new Set());
  const toggleSmbGroup = useCallback((hourKey: string) => {
    setExpandedSmbGroups((prev) => {
      const next = new Set(prev);
      if (next.has(hourKey)) next.delete(hourKey);
      else next.add(hourKey);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    const today = new Date();
    // "date" narrows whatever else is showing (an AND); the other 4 are
    // categories that add to each other (an OR) — selecting both "basal"
    // and "carb" should show entries of either kind, not entries that
    // are somehow both.
    const typeFilters = [...activeFilters].filter((f): f is Exclude<FilterChip, 'date'> => f !== 'date');
    return groupSmbEntries(
      mergeEntries(
        treatments ?? [],
        basalDoses ?? [],
        activities ?? [],
        notes ?? [],
        bleReadings ?? [],
        healthActivities ?? [],
        healthNutrition ?? [],
        nightscoutTreatments ?? [],
      )
        .filter((e) => matchesQuery(e, query))
        .filter((e) => typeFilters.length === 0 || typeFilters.some((f) => matchesFilterChip(e, f, today)))
        .filter((e) => !activeFilters.has('date') || matchesFilterChip(e, 'date', today)),
    );
  }, [
    treatments,
    basalDoses,
    activities,
    notes,
    bleReadings,
    healthActivities,
    healthNutrition,
    nightscoutTreatments,
    query,
    activeFilters,
  ]);

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
              } else if (entry.kind === 'glucose') {
                await deleteReading(BLE_READING_SOURCE, entry.reading._id);
              } else if (entry.kind === 'healthActivity') {
                await deleteHealthActivity(entry.record.source, entry.record.externalId);
              } else if (entry.kind === 'healthNutrition') {
                await deleteHealthNutrition(entry.record.source, entry.record.externalId);
              } else if (entry.kind === 'nightscoutTreatment') {
                await deleteNightscoutTreatment(entry.record.id);
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
    <View style={styles.container} {...swipeHandlers.panHandlers}>
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

      <View style={styles.chipsRow}>
        {FILTER_CHIPS.map((chip) => {
          const active = activeFilters.has(chip.key);
          return (
            <Pressable
              key={chip.key}
              onPress={() => toggleFilter(chip.key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
            </Pressable>
          );
        })}
      </View>

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
        keyExtractor={rowId}
        stickySectionHeadersEnabled
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionRule} />
          </View>
        )}
        renderItem={({ item }) => {
          if (item.kind === 'smbGroup') {
            const expanded = expandedSmbGroups.has(item.hourKey);
            const totalInsulin = item.entries.reduce((sum, e) => sum + (e.insulin ?? 0), 0);
            const hourLabel = new Date(item.hourStart).toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
            });
            return (
              <View style={styles.row}>
                <Pressable onPress={() => toggleSmbGroup(item.hourKey)} style={styles.rowHeader}>
                  <Text style={styles.eventType}>
                    {item.entries.length} SMB{item.entries.length === 1 ? '' : 's'} — {hourLabel}
                  </Text>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.text.tertiary}
                  />
                </Pressable>
                {totalInsulin > 0 && <Text style={styles.detail}>{totalInsulin.toFixed(2)} U total</Text>}
                {expanded && (
                  <View style={styles.smbSubList}>
                    {item.entries.map((record) => (
                      <View key={record.id} style={styles.smbSubRow}>
                        <View style={styles.rowHeader}>
                          <Text style={styles.smbSubLabel}>SMB</Text>
                          <Text style={styles.time}>{new Date(record.createdAt).toLocaleString()}</Text>
                        </View>
                        {record.insulin != null && <Text style={styles.detail}>{record.insulin} U</Text>}
                        {record.notes && <Text style={styles.noteText}>{record.notes}</Text>}
                        <View style={styles.actionsRow}>
                          <Pressable onPress={() => handleDelete({ kind: 'nightscoutTreatment', record })}>
                            <Text style={[styles.actionLink, styles.deleteLink]}>Delete</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          }
          return (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.eventType}>{entryLabel(item)}</Text>
                <Text style={styles.time}>{new Date(logEntryTime(item)).toLocaleString()}</Text>
              </View>
              {entryDetail(item) !== '' && <Text style={styles.detail}>{entryDetail(item)}</Text>}
              {entryNotes(item) && <Text style={styles.noteText}>{entryNotes(item)}</Text>}
              <View style={styles.actionsRow}>
                {!IMPORTED_KINDS.has(item.kind) && (
                  <Pressable onPress={() => setEditingEntry(item)}>
                    <Text style={styles.actionLink}>Edit</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => handleDelete(item)}>
                  <Text style={[styles.actionLink, styles.deleteLink]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
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
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.base,
    },
    chip: {
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: 999,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      backgroundColor: colors.bg.primary,
    },
    chipActive: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    chipTextActive: {
      color: colors.text.inverse,
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
      alignItems: 'center',
    },
    smbSubList: {
      marginTop: spacing.sm,
      paddingLeft: spacing.base,
      borderLeftWidth: 2,
      borderLeftColor: colors.border.subtle,
      gap: spacing.sm,
    },
    smbSubRow: {
      paddingVertical: 6,
    },
    smbSubLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
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
