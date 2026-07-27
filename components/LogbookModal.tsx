import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getRecentTreatments, type Treatment } from '../lib/db/treatments';

interface LogbookModalProps {
  visible: boolean;
  onClose: () => void;
}

const RECENT_COUNT = 50;

export function LogbookModal({ visible, onClose }: LogbookModalProps) {
  const [treatments, setTreatments] = useState<Treatment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setError(null);
    getRecentTreatments(RECENT_COUNT)
      .then((rows) => {
        if (!cancelled) setTreatments(rows);
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

        {error && <Text style={styles.error}>Couldn't load treatments: {error}</Text>}
        {!error && treatments === null && <Text style={styles.message}>Loading…</Text>}
        {!error && treatments?.length === 0 && <Text style={styles.message}>No treatments logged yet.</Text>}

        <FlatList
          data={treatments ?? []}
          keyExtractor={(t) => t.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.eventType}>{item.eventType}</Text>
                <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
              <Text style={styles.detail}>
                {item.insulin != null ? `${item.insulin} U` : null}
                {item.insulin != null && item.carbs != null ? ' · ' : null}
                {item.carbs != null ? `${item.carbs} g carbs` : null}
              </Text>
            </View>
          )}
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
