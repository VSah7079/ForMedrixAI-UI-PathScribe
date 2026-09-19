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
import type { CisoeAScore } from '@/types/cytology/CisoeAScore';
import { generateCytologyReportPdf } from './generateCytologyReportPdf';

// Real, per direct guidance: "It might be easier to implant different
// outbound payload types based on geography." Real, generic,
// discriminated-union extension slot — not a parallel, duplicate
// payload builder per country, and not a payload shape unique to
// every geography by default. Most real nomenclature systems
// (Bethesda, BSCC/RCPath, Münchner Nomenklatur III) already map
// cleanly onto the universal narrative above with no data loss — they
// get no real extension at all. This slot exists specifically for a
// real nomenclature whose own native data genuinely doesn't fit that
// universal shape — CISOE-A's independent, multi-axis score is the
// first, real example; the type stays open (`|` more variants) for
// any future geography that turns out to have the same real need,
// without ever forcing an empty/placeholder extension onto everyone
// else.
export interface CisoeAOruExtension {
  type: 'cisoe_a';
  score: CisoeAScore;
}

export type CytologyOruR01GeographyExtension = CisoeAOruExtension;

export interface CytologyOruR01Payload {
  messageId: string;
  eventType: 'ORU_R01';
  /** Real, per direct correction ("Cytology cases can have addendums")
   *  — 'ADDENDUM' restored after an earlier, wrong assumption that
   *  Cytology had no addendum concept of its own. That reasoning
   *  conflated "Cytology doesn't use Surg Path's own multi-instance
   *  data model" with "Cytology has no addendum concept at all" — two
   *  genuinely separate things. An addendum here is built on this
   *  module's own CytologySignOutRecord architecture (a new, linked,
   *  immutable record — see addsToRecordId), never Surg Path's. */
  resultState: 'FINAL' | 'CORRECTED' | 'ADDENDUM';
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
    /** Real, per direct correction — mirrors
     *  narrative.previouslyReportedAs's own real, verbatim posture:
     *  the real, free-text supplemental content, unchanged from
     *  whatever the caller supplied. Only ever populated for a genuine
     *  ADDENDUM dispatch. */
    previouslyReportedAs?: string;
    addendumText?: string;
  };
  /** The real, generated PDF, base64-encoded — this app's own,
   *  genuinely simpler cytology renderer (generateCytologyReportPdf.ts),
   *  not the external, synoptic-shaped render_report Cloud Function. */
  reportPdfBase64: string;
  /** Real, optional — present only when the underlying review carries
   *  real, native data a receiving system in that specific geography
   *  needs beyond the universal narrative above (see
   *  CytologyOruR01GeographyExtension). Undefined for every other
   *  real nomenclature system, which this universal narrative already
   *  represents completely. Still real, structured JSON only — which
   *  real OBX segment or FHIR extension this becomes on the wire is
   *  the real interface engine's own job, never PathScribe's. */
  geographyExtension?: CytologyOruR01GeographyExtension;
}

export function buildCytologyOruR01Payload(
  signOutRecord: CytologySignOutRecord,
  resultState: 'FINAL' | 'CORRECTED' | 'ADDENDUM' = 'FINAL',
  previouslyReportedAs?: string,
): CytologyOruR01Payload {
  const content = signOutRecord.reportContent;
  const doc = generateCytologyReportPdf(content);
  const dataUri = doc.output('datauristring');
  const reportPdfBase64 = dataUri.split(',').pop() ?? '';

  return {
    messageId: crypto.randomUUID(),
    eventType: 'ORU_R01',
    resultState,
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
      previouslyReportedAs: resultState === 'CORRECTED' ? (previouslyReportedAs || undefined) : undefined,
      addendumText: resultState === 'ADDENDUM' ? (content.addendumText || undefined) : undefined,
    },
    reportPdfBase64,
    geographyExtension: content.cisoeAScore ? { type: 'cisoe_a', score: content.cisoeAScore } : undefined,
  };
}
