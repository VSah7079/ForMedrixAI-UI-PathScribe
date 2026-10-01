// src/services/cytology/buildCytologyProficiencyTestSubmissionPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance on APAC-QA-01 (external proficiency
// testing — RCPAQAP/CAP-style EQA programs), confirmed with real,
// current research (CAP's own official "Direct Transmission" page,
// cap.org, and a March 2026 LIS-integration vendor) rather than
// memory alone — the real, current, standard workflow: "Enter an
// order for PT in your LIS using the standard ordering convention...
// Run the report in your LIS to extract PT results. PT results will
// be transmitted to the CAP." Cytology's own version of
// buildCytologyOruR01Payload.ts, same real principle: PathScribe
// never decides the real transmission format itself — this hands the
// real interface engine the real, structured JSON materials for a
// signed-out PT case, and the engine builds whatever real submission
// format (CAP's own e-LAB Solutions Suite, RCPAQAP's myQAP, etc.) the
// specific provider actually requires.
//
// Real, deliberate scope: only ever called for a real
// CytologySignOutRecord whose own case carries a real
// proficiencyTestContext (types/case/Case.ts) — never a real patient
// case. The caller (not this file) is responsible for that real
// check, matching buildCytologyOruR01Payload.ts's own established
// "caller confirms real eligibility before calling" convention.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';

export interface CytologyProficiencyTestSubmissionPayload {
  messageId: string;
  eventType: 'PT_SUBMISSION';
  eventTimestamp: string;
  caseId: string;
  signOutRecordId: string;
  provider: string;
  challengeReferenceId: string;
  /** Real, per this file's own header — the real, submitted
   *  interpretation, the same real narrative shape
   *  buildCytologyOruR01Payload.ts already sends for a real patient
   *  case. PathScribe never sends or computes a "known answer" here —
   *  it doesn't have one; the real provider is the one who knows it
   *  and grades against it. */
  submittedInterpretation: {
    specimenAdequacy: string;
    generalCategorization?: string;
    primaryInterpretation: string;
    additionalInterpretations?: string;
  };
}

export function buildCytologyProficiencyTestSubmissionPayload(
  signOutRecord: CytologySignOutRecord,
  proficiencyTestContext: { provider: string; challengeReferenceId: string },
): CytologyProficiencyTestSubmissionPayload {
  const content = signOutRecord.reportContent;
  return {
    messageId: crypto.randomUUID(),
    eventType: 'PT_SUBMISSION',
    eventTimestamp: signOutRecord.signedAt,
    caseId: signOutRecord.caseId,
    signOutRecordId: signOutRecord.id,
    provider: proficiencyTestContext.provider,
    challengeReferenceId: proficiencyTestContext.challengeReferenceId,
    submittedInterpretation: {
      specimenAdequacy: content.specimenAdequacy.join('; '),
      generalCategorization: content.generalCategorization,
      primaryInterpretation: content.primaryInterpretation,
      additionalInterpretations: content.additionalInterpretations.length ? content.additionalInterpretations.join('; ') : undefined,
    },
  };
}
