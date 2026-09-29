// src/services/supportReferences/ISupportReferenceService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 364 (PS-350): support references. Support staff talk about a record
// by a reference like SR-7K2Q-9MXD instead of its case number; the lab's own
// staff, who may see patient data, look the reference up in PathScribe.
//
// A reference is random and stored beside the record, never derived from
// the case number: case numbers follow a predictable pattern, so a hash of
// one could be reversed by hashing every possible number. (HIPAA's
// de-identification rule asks the same of a re-identification code.)
//
// Production: the API server issues and resolves references (a table keyed
// by reference, with the record kind and id). This build keeps them in the
// browser (mockSupportReferenceService.ts).
// ─────────────────────────────────────────────────────────────────────────────
import type { ServiceResult } from '../types';

export const SUPPORT_REFERENCE_KINDS = ['case', 'auditEntry', 'errorEntry', 'interfaceException'] as const;
export type SupportReferenceKind = typeof SUPPORT_REFERENCE_KINDS[number];

export interface SupportReference {
  /** 'SR-' + two groups of four Crockford base-32 characters: 40 random bits. */
  ref: string;
  kind: SupportReferenceKind;
  /** The record's own id (a case id, an audit entry id, …). */
  recordId: string;
  createdAt: string;
}

export const SUPPORT_REFERENCE_NOT_FOUND = 'supportReferenceNotFound';
export const SUPPORT_REFERENCE_INVALID = 'supportReferenceInvalid';
export type SupportReferenceError = typeof SUPPORT_REFERENCE_NOT_FOUND | typeof SUPPORT_REFERENCE_INVALID;

export interface ISupportReferenceService {
  /** The record's reference, created the first time it's asked for. */
  forRecord(kind: SupportReferenceKind, recordId: string): Promise<ServiceResult<SupportReference>>;
  /**
   * What a reference points to. Audited (`support_reference.resolved`):
   * looking one up reveals which record it names.
   */
  resolve(ref: string, actor: { id: string; name: string }): Promise<ServiceResult<SupportReference>>;
}
