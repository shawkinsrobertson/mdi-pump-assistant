// Pure humanization of Health Connect's ExerciseType constants
// (SCREAMING_SNAKE_CASE keys, e.g. "BIKING_STATIONARY") into a display
// label ("Biking Stationary"). Kept separate from android.ts — which
// imports the actual native react-native-health-connect module — purely
// so this can be unit tested without a native-module mock, same
// protocol-logic-vs-native-orchestration split as lib/ble/racp.ts vs.
// lib/ble/bleGlucoseMeter.ts.
export function humanizeExerciseTypeKey(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// Reverses a { KEY: number } constants map (like react-native-health-connect's
// ExerciseType) into { number: "Human Label" }, so android.ts doesn't have
// to hand-maintain a separate ~80-entry display-name table that would
// drift from the library's own list over time.
export function buildExerciseTypeLabels(exerciseType: Record<string, number>): Record<number, string> {
  return Object.fromEntries(Object.entries(exerciseType).map(([key, value]) => [value, humanizeExerciseTypeKey(key)]));
}
