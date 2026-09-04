// src/services/abnormalDetection/mockAbnormalDetectionSignalService.ts
// PS-137. Same storageGet/storageSet append-only pattern as
// mockTemplateSuggestionSignalService.ts — see that file for the
// established precedent this mirrors.

import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { AbnormalSeverity } from './IAbnormalTriggerRuleService';
import type { AbnormalDetectionSignal, AbnormalDetectionSignalStats, IAbnormalDetectionSignalService } from './IAbnormalDetectionSignalService';

const STORAGE_KEY = 'pathscribe_abnormal_detection_signals';
const load    = (): AbnormalDetectionSignal[] => storageGet<AbnormalDetectionSignal[]>(STORAGE_KEY, []);
const persist = (signals: AbnormalDetectionSignal[]) => storageSet(STORAGE_KEY, signals);

const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

const SEVERITIES: AbnormalSeverity[] = ['Abnormal', 'Critical', 'Malignant'];
const SOURCES: ('discrete' | 'narrative')[] = ['discrete', 'narrative'];

export const mockAbnormalDetectionSignalService: IAbnormalDetectionSignalService = {
  async recordSignal(input) {
    const signal: AbnormalDetectionSignal = {
      ...input,
      id: `ads-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      capturedAt: new Date().toISOString(),
    };
    persist([...load(), signal]);
    return ok(signal);
  },

  async getByCaseId(caseId) {
    return ok(load().filter(s => s.caseId === caseId));
  },

  async getStats() {
    const all = load();
    const confirmedCount = all.filter(s => s.outcome === 'confirmed').length;

    const bySeverity = {} as AbnormalDetectionSignalStats['bySeverity'];
    for (const sev of SEVERITIES) {
      const forSeverity = all.filter(s => s.suggestedSeverity === sev);
      bySeverity[sev] = { total: forSeverity.length, confirmed: forSeverity.filter(s => s.outcome === 'confirmed').length };
    }

    const bySource = {} as AbnormalDetectionSignalStats['bySource'];
    for (const src of SOURCES) {
      const forSource = all.filter(s => s.source === src);
      bySource[src] = { total: forSource.length, confirmed: forSource.filter(s => s.outcome === 'confirmed').length };
    }

    return ok({
      totalSignals: all.length,
      confirmedCount,
      dismissedCount: all.length - confirmedCount,
      agreementRate: all.length > 0 ? confirmedCount / all.length : 0,
      bySeverity,
      bySource,
    });
  },
};
