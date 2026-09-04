// src/services/cytology/ICytologySignOutRecordService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: the actual Sign Out action needs a real,
// persisted record of it. Same real "always written, never edited"
// posture as ICytologyReviewRecordService — a sign-out, once it
// happens, is a genuine, immutable historical fact; correcting a
// signed-out report is real, separate work (an amendment/addendum
// mechanism, matching this app's own established ReportSnapshot
// vocabulary), never an edit to the original sign-out record itself.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';

export interface ICytologySignOutRecordService {
  getByCaseId(caseId: string): Promise<ServiceResult<CytologySignOutRecord[]>>;
  getBySpecimenId(specimenId: string): Promise<ServiceResult<CytologySignOutRecord[]>>;
  create(record: Omit<CytologySignOutRecord, 'id' | 'signedAt'>): Promise<ServiceResult<CytologySignOutRecord>>;
}
