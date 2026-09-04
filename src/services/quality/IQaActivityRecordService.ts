// src/services/quality/IQaActivityRecordService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-113. Mirrors IReconciliationService's own real, deliberately simple
// shape exactly (getAll/create only, no update/delete) - same real
// "always written, never edited" audit-trail posture
// ReconciliationRecord already established, carried forward unchanged
// for its own generic successor.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { QaActivityRecord } from '@/types/quality/QaActivityRecord';

export interface IQaActivityRecordService {
  getAll(): Promise<ServiceResult<QaActivityRecord[]>>;
  create(record: Omit<QaActivityRecord, 'id' | 'recordedAt'>): Promise<ServiceResult<QaActivityRecord>>;
}
