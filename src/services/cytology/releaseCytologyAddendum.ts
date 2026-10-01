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
import { mockFacilityService } from '../facilities/mockFacilityService';
import { resolvePerformingLabFacilityId } from '../facilities/IFacilityService';

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

  // Real, per PS-277 §1.2.3 — "Addenda forced onto a dedicated page
  // when configured by client policy." facilityId was already a real
  // param here (threaded through to publishReportReleasedEvent's own
  // performingFacilityId); this resolves the real performing lab's own
  // print policy the exact same way every other performing-lab-scoped
  // Facility setting in this app resolves (resolvePerformingLabFacilityId),
  // rather than leaving this as a disclosed, not-yet-wired gap. A real,
  // honest failure to resolve (no facilityId given, facility not found,
  // no performing_lab role/override anywhere) leaves this undefined —
  // the renderer's own existing-behavior default, never a thrown error
  // over what's genuinely just a print-layout preference.
  let forceAddendumOnDedicatedPage: boolean | undefined;
  if (facilityId) {
    const facilityRes = await mockFacilityService.getById(facilityId);
    if (facilityRes.ok) {
      const performingLabId = resolvePerformingLabFacilityId(facilityRes.data);
      const labRes = !performingLabId
        ? undefined
        : performingLabId === facilityRes.data.id
          ? facilityRes
          : await mockFacilityService.getById(performingLabId);
      if (labRes?.ok) forceAddendumOnDedicatedPage = labRes.data.forceAddendumOnDedicatedPagePrintPolicy;
    }
  }

  // Real, per this file's own header — the original diagnosis stays
  // exactly what it was; only addendumText, signedBy, signedAt, and the
  // real print-policy flag above change from the prior record's own
  // real report content.
  const reportContent = {
    ...priorRecord.reportContent,
    addendumText,
    signedBy: { name: addingUser.name, isPathologist: addingUser.isPathologist },
    signedAt: signedAtIso,
    forceAddendumOnDedicatedPage,
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
