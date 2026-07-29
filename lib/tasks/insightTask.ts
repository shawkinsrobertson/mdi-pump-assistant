// Weekly (best-effort) background generation of AI-written glucose
// insights: builds a structured summary from local data, POSTs it to the
// user-configured webhook (Settings > Integrations), and stores whatever
// comes back for the Trends screen to display. See AGENTS.md for the
// background-task rebuild/testing notes.
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { insertInsight, type InsightSource } from '../db/insights';
import { buildInsightPayload } from '../insights/buildInsightPayload';
import { readSettings } from '../settings';

export const INSIGHT_TASK = 'generate-glucose-insights';

// The intended cadence — see registerInsightTask() below — but the OS
// treats this as a floor, not a promise. iOS in particular adapts actual
// firing to the person's own usage patterns over time, so irregular
// timing during early testing is expected behavior, not a bug.
const WEEKLY_SECONDS = 60 * 60 * 24 * 7;

// Shared by the background task below and the "Generate Insights Now"
// button on Trends (screens/TrendsScreen.tsx) — the whole point of
// factoring this out is that the scheduled and on-demand paths always
// send the identical payload shape and land in the identical place,
// rather than drifting into two implementations over time.
export async function runInsightGeneration(source: InsightSource): Promise<boolean> {
  const settings = await readSettings();
  if (!settings.insightsWebhookUrl) {
    // Nothing configured yet — not an error, just nothing to do.
    return false;
  }

  const payload = await buildInsightPayload();
  const response = await fetch(settings.insightsWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Insights webhook returned HTTP ${response.status}`);
  }
  const insight = await response.json();

  await insertInsight({
    generatedAt: new Date().toISOString(),
    payload,
    insight,
    source,
  });
  return true;
}

// Must run unconditionally at module load — index.ts imports this file
// purely for this side effect, before registerRootComponent. TaskManager
// needs the task defined before the OS can invoke it, which can happen in
// a headless JS context where the App component tree never mounts.
TaskManager.defineTask(INSIGHT_TASK, async () => {
  try {
    const didGenerate = await runInsightGeneration('scheduled');
    return didGenerate ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e) {
    console.error('Background insight generation failed:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Called once from App.tsx on startup. Re-registering is a harmless no-op
// per Expo's own docs, but isTaskRegisteredAsync skips the redundant
// native call on every app open rather than relying on that alone.
export async function registerInsightTask(): Promise<void> {
  const already = await TaskManager.isTaskRegisteredAsync(INSIGHT_TASK);
  if (already) return;
  await BackgroundFetch.registerTaskAsync(INSIGHT_TASK, {
    minimumInterval: WEEKLY_SECONDS,
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
