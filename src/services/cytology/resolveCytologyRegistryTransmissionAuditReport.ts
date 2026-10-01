// src/services/cytology/resolveCytologyRegistryTransmissionAuditReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own supplied ANZ-QA-01 specification
// ("National Cancer Screening Register (NCSR/NCSP) Electronic Data
// Transmission Audit" — Accession_ID, Patient_NHI_or_Medicare_No,
// HPV_Result_Code, Cytology_Result_Code, NCSR_Transmission_Timestamp,
// Transmission_Status, Error_Reason_Code). Real, buildable directly
// from this app's own existing registry outbound queue
// (mockCytologyRegistryOutboundQueueService.ts) and sign-out records —
// no new data capture needed at all.
//
// Real, honest gap, same posture as every other real national-ID gap
// in this module (Korea's KCCR, Ireland's PPSN, Northern Ireland's
// Health + Care Number): this app captures no Medicare number or NHI
// anywhere. MRN is shown instead — never a fabricated national ID.
//
// Real, deliberate generality: named for ANZ-QA-01 here, but genuinely
// registry-agnostic — the same real shape works for auditing
// transmission to any of this module's own five other real registries
// (KNCSP/KCCR, CSMS, CervicalCheck, PALGA, NICSP), should a similar
// jurisdiction-specific transmission audit ever be requested for one
// of them.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyRegistryOutboundQueueEntry } from '@/types/case/CytologyRegistryOutboundQueueEntry';
import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';
import type { RegistryId } from '@/services/facilities/IRegistrySettingsService';

export interface CytologyRegistryTransmissionAuditRow {
  caseId: string;
  accessionNumber: string;
  /** Real, honest MRN fallback — see this file's own header. */
  patientMrn?: string;
  hpvResultCode?: string;
  cytologyResultCode: string;
  transmissionTimestamp?: string;
  transmissionStatus: 'QUEUED' | 'SENT' | 'FAILED';
  errorReasonCode?: string;
}

export function resolveCytologyRegistryTransmissionAuditReport(
  queueEntries: CytologyRegistryOutboundQueueEntry[],
  signOutRecordsByCaseId: Record<string, CytologySignOutRecord[]>,
  registryId: RegistryId,
): CytologyRegistryTransmissionAuditRow[] {
  return queueEntries
    .filter(e => e.registryId === registryId)
    .map(e => {
      const signOut = (signOutRecordsByCaseId[e.caseId] ?? []).find(s => s.id === e.signOutRecordId);
      return {
        caseId: e.caseId,
        accessionNumber: signOut?.reportContent.accessionNumber ?? e.caseId,
        patientMrn: signOut?.reportContent.patientMrn,
        hpvResultCode: signOut?.reportContent.hpvResult,
        cytologyResultCode: signOut?.reportContent.primaryInterpretation ?? '—',
        transmissionTimestamp: e.lastAttemptAt ?? e.queuedAt,
        transmissionStatus: e.status,
        errorReasonCode: e.errorCode,
      };
    });
}
