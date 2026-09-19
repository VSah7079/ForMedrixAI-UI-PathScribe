// src/services/reports/buildOruR01Payload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("we trigger the json packages and the
// interface engine generates the formatted messages") and the
// attached Pathology HL7 Outbound Feature Spec §2.2 (Pathology-
// Specific OBX Payload Standards): the real JSON package for a
// finalized/corrected/addendum pathology result. Same real posture as
// buildPatientAdtPayload.ts / jsonWebhookBuilder.ts — PathScribe never
// decides OBX-2 Value Type (FT vs ED vs CE/CWE) itself; that's the
// interface engine's own per-destination decision (confirmed directly
// — "not every client can handle PDF transactions"). This payload
// hands over the raw materials for EITHER real path: discrete
// narrative text fields an engine can format as FT for a client that
// can't handle PDFs, a real, structured answer set for CE/CWE coded
// consumption (LOINC/SNOMED/AJCC staging), and an optional, real,
// already-existing PDF rendering (reused, not duplicated) for a
// client that wants ED visual fidelity.
//
// Real, deliberate scope: reportingMode === 'orchestrator' only. See
// OutboundResultQueueEntry.ts's own header for the full account of
// why an assist-mode case's finalized report is never PathScribe's to
// send.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '../cases/CaseRouter';
import { getTemplate } from '../templates/templateService';
import { resolveAnswers, type ResolvedAnswer } from '@/orchestrator/contextBuilder';
import { resolveFinalDiagnosisText } from '../reportTemplates/resolveFinalDiagnosisText';
import type { SynopticReportInstance } from '@/types/case/Case';
import type { OruResultState } from '@/types/case/OutboundResultQueueEntry';

export interface OruR01Payload {
  messageId: string;
  eventType: 'ORU_R01';
  resultState: OruResultState;
  eventTimestamp: string;
  caseId: string;
  instanceId: string;
  accessionNumber?: string;
  patient: {
    mrn: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  };
  /** Real, per the source spec's own Formatted Text (FT) requirement
   *  — narrative sections that don't need any template-assembly
   *  logic to be reliably correct: real, direct fields on the case
   *  itself, never reconstructed or approximated. Genuinely absent
   *  (not empty-string) fields stay undefined. */
  narrative: {
    clinicalHistory?: string;
    grossDescription?: string;
    microscopicDescription?: string;
    diagnosisComment?: string;
    /** Real, per direct follow-up ("Release as Preliminary" — the
     *  manual trigger PS-292 landed on as the primary, ~80%-of-cases
     *  path) — Case.diagnostic.preliminaryImpression (types/case/
     *  Case.ts), populated only for a genuine PRELIMINARY dispatch;
     *  stays undefined for FINAL/CORRECTED/ADDENDUM, matching every
     *  other field in this object's own "genuinely absent, not
     *  empty-string" convention. */
    preliminaryImpression?: string;
    /** Real, per direct follow-up ("wire in Autopsy") — populated
     *  only when caseData.autopsy exists, from the real, relevant
     *  AutopsyReportSnapshot's own frozenPayload.sections (PAD's own
     *  snapshot for a PRELIMINARY dispatch, FAD's for FINAL —
     *  signAutopsyReport.ts's own real, already-established shape:
     *  {scope, jurisdiction, sections: [{id, label, text}]}, itself
     *  a real snapshot of Case.orchSections at signing time). Kept
     *  as its own, dedicated field rather than force-mapped onto
     *  grossDescription/microscopicDescription above — an autopsy
     *  report's own real section labels are variable, not the fixed
     *  gross/microscopic/diagnosis set Surg Path's own template
     *  system uses. */
    autopsySections?: { label: string; text: string }[];
    /** Real, per direct correction ("the system shouldn't be
     *  constructing anything... the previous text for the Final
     *  Diagnosis is the previously reported as") — the prior,
     *  pre-amendment instance.comment, verbatim, never diffed or
     *  reworded. Sourced from the real AmendmentRecord's own
     *  originalReportSnapshot (captured at the moment the amendment
     *  was started, before any editing happened) by this function's
     *  own caller — buildOruR01Payload itself has no way to know a
     *  "before" state on its own, since it only ever reads the
     *  current, live case. Only ever meaningful for a real CORRECTED
     *  dispatch; an ADDENDUM adds supplemental content rather than
     *  replacing prior text, so this stays undefined there. */
    previouslyReportedAs?: string;
  };
  /** Real, per direct guidance ("we could define an interface
   *  template that operates as a plain text interface, that
   *  accompanies the pdf transaction and let engine sort it out"):
   *  the actual, template-assembled diagnosis narrative — requested
   *  from the SAME real, external rendering service that already
   *  produces reportPdfBase64 below (bodyAssembly/headerAssembly/
   *  footerAssembly/sections — the real, template-dictated structure
   *  this app's own PDF generation already sends,
   *  SynopticReportPage.tsx's generateReportPdfSnapshot), just
   *  requesting a plain-text rendering instead of PDF bytes, so both
   *  real, correctly-rendered outputs come from one single source of
   *  truth rather than PathScribe attempting a second, independent
   *  reconstruction that could quietly disagree with the actual
   *  signed report. Never fabricated by joining raw field
   *  labels/values, which was tried and rejected earlier for exactly
   *  this reason (real risk of disagreeing with the actual signed
   *  report).
   *
   *  Real, per direct follow-up: the service-side extension is now
   *  real, not speculative — functions/main.py's render_report Cloud
   *  Function genuinely supports outputFormat: 'text' (verified
   *  directly against its real source, not assumed; 29 real checks in
   *  functions/test_main.py cover every real node type plus the full
   *  HTTP entrypoint), and SynopticReportPage.tsx's own
   *  generateReportTextSnapshot() genuinely calls it. Still absent
   *  here in practice, though, for a real, honest, separate reason:
   *  no real caller supplies generateReportTextSnapshot to
   *  buildOruR01Payload()'s own generateNarrativeText parameter yet
   *  — the one real caller today, Config/System/
   *  OutboundMessagePreviewSection.tsx, is a standalone admin tool
   *  with no access to that function's own React-component closures.
   *  Wiring a real ORU^R01 dispatch trigger from within
   *  SynopticReportPage.tsx itself is real, separate, next-step
   *  work. */
  reportNarrativeText?: string;
  /** Real, per the source spec's own Coded Elements (CE/CWE)
   *  requirement — the raw, structured synoptic answers themselves,
   *  for an engine that wants to extract specific coded fields (AJCC
   *  staging parameters, etc.) rather than parse narrative text. One
   *  real array per finalized instance on the case — an addendum or a
   *  case with multiple specimens can carry more than one. */
  structuredDiagnosisAnswers: { instanceId: string; specimenId: string; templateName: string; answers: ResolvedAnswer[] }[];
  /** Real, per direct guidance (PS-105/PS-135) and this file's own
   *  established posture ("we trigger the json packages and the
   *  interface engine generates the formatted messages") — same real
   *  boundary as OBX-2 Value Type above: PathScribe does NOT decide
   *  real HL7 table 0078 codes (A/AA) here, that's the interface
   *  engine's own per-destination decision. This is only the real,
   *  structured raw material — severity, confidence, and reasoning —
   *  for the engine to map into OBX-8 (or whatever else) however a
   *  given destination actually requires. Populated only from a
   *  pathologist-CONFIRMED status (Case.abnormalDetectionStatus, real
   *  per PS-133/134's own posture) — genuinely absent, not a
   *  fabricated "normal" value, for a case with no confirmed finding
   *  at all. */
  abnormalFlags?: { severity: 'Abnormal' | 'Critical' | 'Malignant'; confirmedAt: string };
  /** Real, per direct guidance ("not every client can handle PDF
   *  transactions... does the engine build it, or does PathScribe do
   *  it"): optional, only populated when explicitly requested —
   *  reuses this app's own real, existing PDF rendering
   *  (generateReportPdfSnapshot, SynopticReportPage.tsx) rather than a
   *  second, duplicate implementation. The interface engine decides,
   *  per real destination, whether to use this (ED) or the narrative
   *  fields above (FT) — never PathScribe's own decision to make. */
  reportPdfBase64?: string;
}

/**
 * Real, per direct guidance: builds the full ORU^R01 payload for one
 * real, finalized SynopticReportInstance. Returns null honestly (not
 * a fabricated payload) when the case or instance genuinely doesn't
 * exist, or when the case is not reportingMode 'orchestrator' — an
 * assist-mode case is never this function's to build a payload for.
 * generatePdf/generateNarrativeText are both real, separate, optional
 * steps (the caller's own choice, not this function's default) —
 * both reuse SynopticReportPage.tsx's own real, existing rendering
 * pipeline (the same external service, requesting PDF vs. plain-text
 * output respectively), never a second, independent implementation.
 */
export async function buildOruR01Payload(
  caseId: string,
  instanceId: string,
  resultState: OruResultState,
  generatePdf?: () => Promise<{ pdfBase64?: string; generationError?: string }>,
  generateNarrativeText?: () => Promise<{ text?: string; generationError?: string }>,
  /** Real, per direct correction — see this function's own return
   *  type's doc comment on narrative.previouslyReportedAs for the
   *  full, real reasoning. The caller's own responsibility to supply
   *  the real, prior instance.comment verbatim; this function never
   *  fetches or constructs it itself. */
  previouslyReportedAs?: string,
): Promise<OruR01Payload | null> {
  const caseData = await caseRouter.getCase(caseId);
  if (!caseData) return null;
  if (caseData.reportingMode !== 'orchestrator') return null;

  const instances = caseData.synopticReports ?? [];
  const instance = instances.find(i => i.instanceId === instanceId);
  if (!instance) return null;

  // Real, per direct guidance: reuses the exact same resolveAnswers()
  // rendering this app's own PDF generator already uses — never a
  // second, separate rendering of the same real structured answers.
  // This part stays genuinely reliable regardless of the
  // reportNarrativeText gap below — CE/CWE consumption needs
  // accurate field-level data, not template assembly.
  // Real, per direct follow-up ("Release as Preliminary"): a
  // Preliminary dispatch has no finalized instance at all yet by
  // definition — that's the whole point of releasing one. Includes
  // every real instance on the case for that result state instead,
  // since sharing partial, in-progress answers is exactly what a
  // Preliminary dispatch is for; FINAL/CORRECTED/ADDENDUM keep the
  // original, strict finalized-only filter unchanged.
  const structuredDiagnosisAnswers = await Promise.all(
    instances
      .filter((i: SynopticReportInstance) => resultState === 'PRELIMINARY' ? true : i.status === 'finalized')
      .map(async (i: SynopticReportInstance) => {
        const detail = await getTemplate(i.templateId);
        const resolved = resolveAnswers(i.answers ?? {}, detail?.template ?? null);
        return { instanceId: i.instanceId, specimenId: i.specimenId, templateName: i.templateName, answers: resolved };
      })
  );

  const [pdfResult, narrativeResult] = await Promise.all([
    generatePdf ? generatePdf() : Promise.resolve(undefined),
    generateNarrativeText ? generateNarrativeText() : Promise.resolve(undefined),
  ]);

  return {
    messageId: `oru-${caseId}-${instanceId}-${Date.now().toString(36)}`,
    eventType: 'ORU_R01',
    resultState,
    eventTimestamp: new Date().toISOString(),
    caseId,
    instanceId,
    accessionNumber: caseData.accession?.fullAccession ?? caseData.accession?.accessionNumber,
    patient: {
      mrn: caseData.patient.mrn,
      firstName: caseData.patient.firstName ?? caseData.patient.givenNames,
      lastName: caseData.patient.lastName ?? caseData.patient.familyNames,
      dateOfBirth: caseData.patient.dateOfBirth,
    },
    narrative: {
      clinicalHistory: caseData.order?.clinicalIndication || undefined,
      grossDescription: caseData.diagnostic?.grossDescription || undefined,
      microscopicDescription: caseData.diagnostic?.microscopicDescription || undefined,
      // Real, per direct correction ("a text field on the report
      // should be declared as the final diagnosis") — instance.comment
      // has no real, dedicated editing UI at all (confirmed directly)
      // and can't be trusted to hold the real diagnosis. Resolves
      // whichever field a real template author explicitly designated
      // instead — genuinely absent (undefined) rather than a guessed
      // value when no field was designated.
      diagnosisComment: await resolveFinalDiagnosisText(instance.templateId, instance.answers ?? {}),
      preliminaryImpression: resultState === 'PRELIMINARY' ? (caseData.diagnostic?.preliminaryImpression || undefined) : undefined,
      // Real, per this file's own header comment above: only present
      // when caseData.autopsy genuinely exists, and only from the
      // real snapshot matching this dispatch's own resultState — a
      // PRELIMINARY dispatch reads PAD's own real, frozen sections;
      // FINAL (and CORRECTED/ADDENDUM, which reuse FAD's own real,
      // signed content) reads FAD's. Never both, and never a
      // fallback to whichever snapshot happens to exist — a
      // PRELIMINARY dispatch for a case that hasn't had its PAD
      // signed yet genuinely has no real sections to report.
      autopsySections: (() => {
        const autopsy = (caseData as any)?.autopsy;
        if (!autopsy) return undefined;
        const snapshot = resultState === 'PRELIMINARY' ? autopsy.padSnapshot : autopsy.fadSnapshot;
        const sections = snapshot?.frozenPayload?.sections;
        return Array.isArray(sections) ? sections.map((s: any) => ({ label: s.label, text: s.text })) : undefined;
      })(),
      previouslyReportedAs: resultState === 'CORRECTED' ? (previouslyReportedAs || undefined) : undefined,
    },
    reportNarrativeText: narrativeResult?.text,
    structuredDiagnosisAnswers,
    abnormalFlags: caseData.abnormalDetectionStatus ?? undefined,
    reportPdfBase64: pdfResult?.pdfBase64,
  };
}
