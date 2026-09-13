// src/services/cytology/ICytologyProficiencyTestResultService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance on APAC-QA-01, confirmed with real,
// current research (CAP's own official documentation; 42 CFR § 493
// PT requirements) before designing this — same real reasoning as
// IMolecularQcRunRecordService.ts's own header: a real, external
// grading outcome is genuinely its own record, not blended into the
// case's own real clinical data (a PT grade is an administrative/QA
// fact about a synthetic challenge, never a real patient's own
// clinical result). One real record per real, received grade —
// populated only from a real, already-translated inbound event
// (processInboundCytologyProficiencyTestResultEvent.ts,
// services/hl7/), never manual UI entry, same posture as
// hpvAbnormalFlag/hpvReferenceRange and MolecularQcRunRecord before
// it.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { CytologyProficiencyTestResultEventPayload } from '@/types/events/CytologyProficiencyTestResultEventPayload';

export interface CytologyProficiencyTestResult {
  id: string;
  caseId: string;
  accessionNumber: string;
  provider: string;
  challengeReferenceId: string;
  outcome: CytologyProficiencyTestResultEventPayload['outcome'];
  scoreDetail?: string;
  expectedAnswer?: string;
  receivedAt: string;
}

export interface ICytologyProficiencyTestResultService {
  getAll(): Promise<ServiceResult<CytologyProficiencyTestResult[]>>;
  /** Real, per this file's own header — creates a new real result
   *  record from an already-translated inbound event; never called
   *  from manual UI entry. */
  add(result: Omit<CytologyProficiencyTestResult, 'id'>): Promise<ServiceResult<CytologyProficiencyTestResult>>;
}
