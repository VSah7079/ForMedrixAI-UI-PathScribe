// src/services/cytology/releaseCytologyAddendum.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct correction ("Cytology cases can have addendums...
// Addendum: appends new, additional data or subsequent test results to
// the report while leaving the original diagnosis intact") — the real
// addendum mechanism, genuinely simpler than releaseCytologyCorrection.ts
// because nothing about the underlying diagnosis changes here. No new
// CytologyReviewRecord is created — the new sign-out record references
// the SAME reviewRecordId as the one it adds to, since the actual
// clinical finding is unchanged; only the report content grows a new
// addendumText, and everything else is carried forward unaltered from
// the prior record. Same real "always written, never edited" posture
// as every other real event in this module: a new, linked
// CytologySignOutRecord (addsToRecordId), never a mutation of the one
// it supplements.
// ─────────────────────────────────────────────────────────────────────────────

import { mockCytologySignOutRecordService } from './mockCytologySignOutRecordService';
import { publishReportReleasedEvent } from '../reports/publishReportReleasedEvent';

export interface ReleaseCytologyAddendumResult {
  ok: boolean;
  signOutRecordId?: string;
  error?: string;
}

export async function releaseCytologyAddendum(
  caseId: string,
  specimenId: string,
  addendumText: string,
  addingUser: { id: string; name: string; isPathologist: boolean },
  facilityId?: string,
  generatePdf?: () => Promise<{ pdfBase64?: string; generationError?: string }>,
): Promise<ReleaseCytologyAddendumResult> {
  const priorRecordsRes = await mockCytologySignOutRecordService.getBySpecimenId(specimenId);
  if (!priorRecordsRes.ok || priorRecordsRes.data.length === 0) {
    return { ok: false, error: 'No prior sign-out exists for this specimen — nothing to add an addendum to.' };
  }
  const priorRecord = [...priorRecordsRes.data].sort((a, b) => b.signedAt.localeCompare(a.signedAt))[0];

  const signedAtIso = new Date().toISOString();
  // Real, per this file's own header — the original diagnosis stays
  // exactly what it was; only addendumText, signedBy, and signedAt
  // change from the prior record's own real report content.
  const reportContent = {
    ...priorRecord.reportContent,
    addendumText,
    signedBy: { name: addingUser.name, isPathologist: addingUser.isPathologist },
    signedAt: signedAtIso,
  };

  const createRes = await mockCytologySignOutRecordService.create({
    caseId, specimenId,
    reviewRecordId: priorRecord.reviewRecordId,
    reportContent,
    signedBy: { userId: addingUser.id, userName: addingUser.name, isPathologist: addingUser.isPathologist },
    addsToRecordId: priorRecord.id,
  });
  if (!createRes.ok) return { ok: false, error: 'Could not create the addendum sign-out record.' };
  const newRecord = createRes.data;

  await publishReportReleasedEvent({
    caseId,
    instanceId: newRecord.id,
    reportType: 'ADDENDUM',
    source: 'CYTOLOGY',
    releasedAt: signedAtIso,
    releasedBy: { id: addingUser.id, name: addingUser.name },
    performingFacilityId: facilityId,
    generatePdf,
  });

  return { ok: true, signOutRecordId: newRecord.id };
}
