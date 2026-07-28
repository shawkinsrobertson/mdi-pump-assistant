import { StyleSheet, Text, View } from 'react-native';

// Placeholder for the Trends screen (Time in Range, Ambulatory Glucose
// Profile, Patterns and Insights, clinician export) — deliberately built
// after the navigation shell, per an explicit build-order decision. See
// AGENTS.md for the data-retention and Insights-scope decisions already
// made for this screen.
export function TrendsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trends</Text>
      <Text style={styles.message}>Coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#888',
  },
});
