// src/services/quality/ISurgicalPeerReviewRiskWeightService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-324. Real, minimal CRUD for QaSubspecialtyRiskWeight — see that
// type's own doc comment for why this is its own small service rather
// than a field on Subspecialty.ts or QaActivityType.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { QaSubspecialtyRiskWeight } from '@/types/quality/QaSubspecialtyRiskWeight';

export interface ISurgicalPeerReviewRiskWeightService {
  getAll(): Promise<ServiceResult<QaSubspecialtyRiskWeight[]>>;
  /** Real, per direct guidance: creates or replaces the one real weight
   *  for a given subspecialty — never a second, competing weight for
   *  the same real subspecialtyId. Rejects a multiplier <= 0, matching
   *  every other real range-constrained numeric field's own service-
   *  layer validation in this app. */
  setWeight(subspecialtyId: string, multiplier: number, updatedBy: string): Promise<ServiceResult<QaSubspecialtyRiskWeight>>;
  removeWeight(subspecialtyId: string): Promise<ServiceResult<void>>;
}
