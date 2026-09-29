// src/services/signatures/ISignatureRecordService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 345 (PS-60 follow-up): the signature records. One per signature
// applied to a case: who signed, what the signature meant (sign-out,
// countersignature, finalisation, autopsy PAD/FAD, cytology sign-out), when,
// and how the signer was confirmed (services/auth/signatureEvidence.ts).
// Append-only: records are never edited or deleted.
//
// Production: a SQL Server table owned by the API server, written in the
// same transaction as the signed state change.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { SignatureEvidence } from '../auth/signatureEvidence';

/** What the signature did. */
export type SignatureOutcome = 'signed' | 'finalized' | 'released_for_countersign';

/** The record the signature belongs to, where there is one besides the case. */
export interface SignatureRecordLink {
  kind: 'report-version' | 'autopsy-snapshot' | 'cytology-sign-out';
  id?: string;
  tier?: 'PAD' | 'FAD';
}

export interface SignatureRecord {
  id: string;
  caseId: string;
  outcome: SignatureOutcome;
  evidence: SignatureEvidence;
  link: SignatureRecordLink | null;
  recordedAt: string;
}

export interface ISignatureRecordService {
  record(input: Omit<SignatureRecord, 'id' | 'recordedAt'>): Promise<ServiceResult<SignatureRecord>>;
  getByCaseId(caseId: string): Promise<ServiceResult<SignatureRecord[]>>;
}
