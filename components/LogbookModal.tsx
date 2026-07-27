import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getRecentBasalDoses, type BasalDoseRecord } from '../lib/db/basalDoses';
import { getRecentTreatments, type Treatment } from '../lib/db/treatments';

interface LogbookModalProps {
  visible: boolean;
  onClose: () => void;
}

const RECENT_COUNT = 50;

type LogEntry = { kind: 'treatment'; treatment: Treatment } | { kind: 'basal'; dose: BasalDoseRecord };

function mergeEntries(treatments: Treatment[], basalDoses: BasalDoseRecord[]): LogEntry[] {
  const entries: LogEntry[] = [
    ...treatments.map((treatment): LogEntry => ({ kind: 'treatment', treatment })),
    ...basalDoses.map((dose): LogEntry => ({ kind: 'basal', dose })),
  ];
  const timeOf = (e: LogEntry) => (e.kind === 'treatment' ? e.treatment.createdAt : e.dose.injectedAt);
  return entries.sort((a, b) => timeOf(b).localeCompare(timeOf(a)));
}

export function LogbookModal({ visible, onClose }: LogbookModalProps) {
  const [treatments, setTreatments] = useState<Treatment[] | null>(null);
  const [basalDoses, setBasalDoses] = useState<BasalDoseRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
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
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>Logbook</Text>

        {error && <Text style={styles.error}>Couldn't load entries: {error}</Text>}
        {!error && (treatments === null || basalDoses === null) && <Text style={styles.message}>Loading…</Text>}
        {!error && treatments?.length === 0 && basalDoses?.length === 0 && (
          <Text style={styles.message}>Nothing logged yet.</Text>
        )}

        <FlatList
          data={mergeEntries(treatments ?? [], basalDoses ?? [])}
          keyExtractor={(e) => `${e.kind}:${e.kind === 'treatment' ? e.treatment.id : e.dose.id}`}
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
        />

        <Pressable style={styles.button} onPress={onClose}>
          <Text style={styles.buttonText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  message: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
  },
  error: {
    fontSize: 14,
    color: '#c00',
    marginBottom: 12,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eventType: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  time: {
    fontSize: 12,
    color: '#888',
  },
  detail: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
  },
  button: {
    backgroundColor: '#888',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
