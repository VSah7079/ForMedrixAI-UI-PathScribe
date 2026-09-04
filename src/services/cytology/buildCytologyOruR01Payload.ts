// src/services/cytology/buildCytologyOruR01Payload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("we trigger the json packages and the
// interface engine generates the formatted messages") — cytology's own
// version of buildOruR01Payload.ts. Same real principle: PathScribe
// never decides HL7 formatting itself; this hands the interface engine
// the real, structured JSON materials — narrative-equivalent fields
// plus an embedded, real, base64-encoded PDF this app generates itself
// (generateCytologyReportPdf.ts) — and the engine builds the actual
// ORU^R01 transaction from it.
//
// Real, deliberate scope, mirroring buildOruR01Payload's own: only
// ever called for a real CytologySignOutRecord on an orchestrator-mode
// case — see resolveCytologyStructuredWorkflowAccess.ts for why an
// assist-mode case is never PathScribe's to send.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologySignOutRecord } from '@/types/cytology/CytologySignOutRecord';
import { generateCytologyReportPdf } from './generateCytologyReportPdf';

export interface CytologyOruR01Payload {
  messageId: string;
  eventType: 'ORU_R01';
  resultState: 'FINAL';
  eventTimestamp: string;
  caseId: string;
  signOutRecordId: string;
  accessionNumber: string;
  patient: {
    mrn?: string;
    name: string;
    dateOfBirth?: string;
  };
  /** Real, discrete, narrative-equivalent fields — a plain-text
   *  rendering of the real report content, for a receiving client
   *  that can't handle a PDF transaction (same real "not every client
   *  can handle PDF transactions" reasoning buildOruR01Payload's own
   *  narrative field already established). */
  narrative: {
    specimenAdequacy: string;
    generalCategorization?: string;
    primaryInterpretation: string;
    additionalInterpretations?: string;
    recommendations?: string;
  };
  /** The real, generated PDF, base64-encoded — this app's own,
   *  genuinely simpler cytology renderer (generateCytologyReportPdf.ts),
   *  not the external, synoptic-shaped render_report Cloud Function. */
  reportPdfBase64: string;
}

export function buildCytologyOruR01Payload(signOutRecord: CytologySignOutRecord): CytologyOruR01Payload {
  const content = signOutRecord.reportContent;
  const doc = generateCytologyReportPdf(content);
  const dataUri = doc.output('datauristring');
  const reportPdfBase64 = dataUri.split(',').pop() ?? '';

  return {
    messageId: crypto.randomUUID(),
    eventType: 'ORU_R01',
    resultState: 'FINAL',
    eventTimestamp: signOutRecord.signedAt,
    caseId: signOutRecord.caseId,
    signOutRecordId: signOutRecord.id,
    accessionNumber: content.accessionNumber,
    patient: { mrn: content.patientMrn, name: content.patientName, dateOfBirth: content.patientDateOfBirth },
    narrative: {
      specimenAdequacy: content.specimenAdequacy.join('; '),
      generalCategorization: content.generalCategorization,
      primaryInterpretation: content.primaryInterpretation,
      additionalInterpretations: content.additionalInterpretations.length ? content.additionalInterpretations.join('; ') : undefined,
      recommendations: content.recommendations.length ? content.recommendations.join('; ') : undefined,
    },
    reportPdfBase64,
  };
}
