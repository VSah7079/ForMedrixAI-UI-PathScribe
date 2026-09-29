// src/services/assistPolling/mockAssistPollingService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-87: stored polling state (settings, cursor, per-case milestone records
// and the recent-run log). One deployment-wide LIS connection, like Voice;
// localStorage in the mock.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { AssistPollingSettings, AssistPollingState } from './types';
import { DEFAULT_ASSIST_POLLING_SETTINGS, findCrosswalkProblems } from './assistMilestoneRules';

export const ASSIST_POLLING_STORAGE_KEY = 'pathscribe_assist_lis_polling';

export interface IAssistPollingService {
  getState(): Promise<AssistPollingState>;
  saveState(state: AssistPollingState): Promise<void>;
  /** Validates and saves the admin settings. Errors are codes:
   *  INTERVAL_OUT_OF_RANGE, CROSSWALK_BLANK_STATUS, CROSSWALK_DUPLICATE_STATUS. */
  saveSettings(settings: AssistPollingSettings): Promise<ServiceResult<AssistPollingSettings>>;
}

export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 1440;

const initialState = (): AssistPollingState => ({
  settings: { ...DEFAULT_ASSIST_POLLING_SETTINGS, statusCrosswalk: DEFAULT_ASSIST_POLLING_SETTINGS.statusCrosswalk.map(e => ({ ...e })) },
  cursor: null,
  records: {},
  runs: [],
});

/** Pure settings check, shared with the admin screen's save. */
export function validateAssistPollingSettings(s: AssistPollingSettings): string | null {
  if (!Number.isInteger(s.intervalMinutes) || s.intervalMinutes < MIN_INTERVAL_MINUTES || s.intervalMinutes > MAX_INTERVAL_MINUTES) return 'INTERVAL_OUT_OF_RANGE';
  const problems = findCrosswalkProblems(s.statusCrosswalk);
  if (problems.blank.length) return 'CROSSWALK_BLANK_STATUS';
  if (problems.duplicates.length) return 'CROSSWALK_DUPLICATE_STATUS';
  return null;
}

export const mockAssistPollingService: IAssistPollingService = {
  async getState() {
    return storageGet<AssistPollingState>(ASSIST_POLLING_STORAGE_KEY, initialState());
  },
  async saveState(state) {
    storageSet(ASSIST_POLLING_STORAGE_KEY, state);
  },
  async saveSettings(settings) {
    const error = validateAssistPollingSettings(settings);
    if (error) return { ok: false, error };
    const clean: AssistPollingSettings = {
      ...settings,
      statusCrosswalk: settings.statusCrosswalk.map(e => ({ ...e, lisStatus: e.lisStatus.trim() })),
    };
    const state = await mockAssistPollingService.getState();
    storageSet(ASSIST_POLLING_STORAGE_KEY, { ...state, settings: clean });
    return { ok: true, data: clean };
  },
};
