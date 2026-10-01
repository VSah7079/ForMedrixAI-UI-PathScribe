// src/services/quality/mockSurgicalPeerReviewRiskWeightService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-324. Real, localStorage-backed implementation of
// ISurgicalPeerReviewRiskWeightService — same real ok/err/storageGet/
// storageSet convention every other mock service in this app uses (see
// mockQaActivityTypeService.ts's own header), not a separate,
// parallel pattern invented here.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { ISurgicalPeerReviewRiskWeightService } from './ISurgicalPeerReviewRiskWeightService';
import type { QaSubspecialtyRiskWeight } from '@/types/quality/QaSubspecialtyRiskWeight';

const STORAGE_KEY = 'surgical_peer_review_risk_weights_v1';

const load = (): QaSubspecialtyRiskWeight[] => storageGet<QaSubspecialtyRiskWeight[]>(STORAGE_KEY, []);
const persist = (data: QaSubspecialtyRiskWeight[]) => storageSet(STORAGE_KEY, data);

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

export const mockSurgicalPeerReviewRiskWeightService: ISurgicalPeerReviewRiskWeightService = {
  async getAll() {
    return ok([...load()]);
  },

  async setWeight(subspecialtyId, multiplier, updatedBy) {
    if (!subspecialtyId.trim()) return err('subspecialtyId is required.');
    if (!(multiplier > 0)) return err('multiplier must be greater than 0.');

    const existing = load();
    const now = new Date().toISOString();
    const withoutThisOne = existing.filter(w => w.subspecialtyId !== subspecialtyId);
    const record: QaSubspecialtyRiskWeight = {
      id: existing.find(w => w.subspecialtyId === subspecialtyId)?.id ?? `qa-risk-weight-${Date.now().toString(36)}`,
      subspecialtyId, multiplier, updatedAt: now, updatedBy,
    };
    persist([...withoutThisOne, record]);
    return ok(record);
  },

  async removeWeight(subspecialtyId) {
    persist(load().filter(w => w.subspecialtyId !== subspecialtyId));
    return ok(undefined);
  },
};
