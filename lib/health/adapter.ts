// No-op fallback adapter for any platform without a real implementation
// (web preview, most notably — see AGENTS.md's "SharedArrayBuffer"/web
// preview notes elsewhere in this codebase for why web never touches
// native modules). Metro's platform resolution picks this file over
// adapter.ios.ts/adapter.android.ts for web (and anything else neither of
// those two names), so neither native health SDK is ever imported there.
import type { HealthAdapter } from './types';

export const healthAdapter: HealthAdapter = {
  isAvailable: async () => false,
  requestPermissions: async () => false,
  readSteps: async () => [],
  readActivities: async () => [],
  readNutrition: async () => [],
};
