// src/services/grossing/IGrossingEvaluationService.ts
// ─────────────────────────────────────────────────────────────
// Types for Stage 0 (Accession -> AI Grossing Template assignment).
// Mirrors IAIIntegrationService.ts's SynopticEvaluationInput/Result
// pattern, but kept in its own file (per Stage 0 Requirements §6.1) so
// grossing-routing types stay isolated from the diagnostic Synoptic
// evaluation path — these are a different decision (which of three
// Grossing Routes a specimen needs) made at a different point in the
// workflow (accession, before any PA has touched the case).
//
// The REAL implementation, like evaluateSynopticAssignment, is a plain
// function in mockCaseService.ts that calls callAi() directly — see that
// function's header comment for why IAIIntegrationService-style interfaces
// aren't actually wired to the real call path in this app. These types
// are imported (type-only) from there to avoid duplicating the shape.
// ─────────────────────────────────────────────────────────────

import type { ProtocolChange } from '@/types/case/Case';

/** One specimen's worth of input for evaluateGrossingTemplateAssignment. */
export interface GrossingEvaluationSpecimen {
  specimenId: string;
  specimenLabel: string;
  /** Free-text specimen description from accession — the single most
   *  important routing signal (S0-IN-01). */
  specimenDesc: string;
  /** Structured specimen type, if captured (S0-IN-02). Not yet a real
   *  field on Specimen.ts (see S0-CF-01) — optional until that lands. */
  specimenType?: string;
  /** Body site / organ system (S0-IN-03). */
  bodySite?: string;
  /** Left / Right / Bilateral / Not applicable (S0-IN-04). */
  laterality?: string;
}

/**
 * Pass G0 override — a facility-specific forced Grossing Template for a
 * given specimen type, bypassing the AI entirely (S0-CF-11). Passed in so
 * the AI evaluation can see which templates are administratively locked
 * and document its reasoning accordingly, even when the choice wasn't
 * actually AI-recommended (S0-CF-13). Admin UI for managing these
 * (S0-CF-12) is not yet built — this shape exists so the evaluation
 * function's input contract is ready for it.
 */
export interface GrossingRoutingOverride {
  facilityId: string;
  specimenType: string;
  grossingTemplateId: string;
}

/**
 * Input for evaluateGrossingTemplateAssignment. Deliberately narrow, same
 * PHI-minimization posture as SynopticEvaluationInput — only clinical/
 * specimen content needed for routing, no patient name/DOB/MRN.
 */
export interface GrossingEvaluationInput {
  specimens: GrossingEvaluationSpecimen[];
  /** Physician's stated reason for the specimen (S0-IN-05). */
  clinicalIndication?: string;
  /** Optional case-level context that improves accuracy (S0-IN-07). */
  caseContext?: {
    patientAge?: number;
    caseType?: string;
    facilityId?: string;
  };
  /**
   * Candidate Grossing Template IDs the AI may choose from — same
   * grounding requirement as SynopticEvaluationInput.availableTemplates.
   * Caller resolves this via templateService.listTemplates('published')
   * filtered to isDiagnostic === false (S0-IN-06) — the inverse of Stage
   * 1's filter.
   */
  availableTemplates: Array<{ id: string; name: string; category: string }>;
  /** Any Pass G0 overrides in effect (S0-CF-13). Empty until S0-CF-12's
   *  admin UI exists. */
  routingOverrides?: GrossingRoutingOverride[];
  /**
   * Minimum confidence (0–100) below which a specimen falls back to the
   * default template rather than trusting a low-confidence AI pick
   * (S0-FR-05 / S0-CF-14). Defaults to 60 if omitted.
   */
  confidenceThreshold?: number;
}

export interface GrossingTemplateAssignment {
  specimenId: string;
  templateId: string;
  templateName: string;
  confidence: number;
  /** Plain-language reason from AI analysis, or "Pass G0 override" /
   *  "fell back to default — see warnings" when not actually AI-chosen. */
  reason: string;
  /** True if this specimen's templateId came from a Pass G0 override
   *  rather than the AI. */
  fromOverride?: boolean;
  /** True if the AI's pick was below confidenceThreshold and this
   *  assignment is the configured fail-open default instead (S0-FR-05). */
  belowThreshold?: boolean;
}

export interface GrossingEvaluationResult {
  assignments: GrossingTemplateAssignment[];
  /** Non-fatal issues — same never-hard-fail pattern as
   *  SynopticEvaluationResult / TemplateRoutingService / contextBuilder. */
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "there is kind of a workflow that
// allows the Gross to be dictated and on submission, the AI reads the
// Text, and updates the template." Confirmed directly: that workflow
// (generateGrossingFieldSuggestionsFromDictation, mockCaseService.ts)
// already exists and already re-populates whatever template's fields it's
// given from the case's real, dictated Gross text — the missing piece
// wasn't the "narrative -> fields" capability, it's a real trigger to
// RE-EVALUATE which Grossing Template best fits now that real dictated
// text exists, which the accession-time-only evaluateGrossingTemplateAssignment
// never does. Mirrors SynopticEvaluationInput/Result and
// evaluateSynopticAssignment's own, already-proven "Stage 1" pattern
// exactly — this is that same real pattern, one stage earlier in the
// pipeline (Grossing, not the diagnostic Synoptic).
// ─────────────────────────────────────────────────────────────────────────

export interface GrossingFitEvaluationSpecimen {
  specimenId: string;
  specimenLabel: string;
  specimenDesc: string;
  /** The Grossing template currently assigned to this specimen, if any —
   *  absent only for a genuinely new specimen with no assignment yet,
   *  which shouldn't occur in practice at this stage but is handled
   *  honestly either way. */
  currentGrossingTemplate?: { instanceId: string; templateId: string; templateName: string };
}

export interface GrossingFitEvaluationInput {
  /** The case's real, dictated Gross Description — the same
   *  case-level narrative generateGrossingFieldSuggestionsFromDictation
   *  itself already reads from. This is deliberately the only real text
   *  input; unlike Stage 1 Synoptic evaluation, a Grossing Route decision
   *  turns on gross findings specifically, not microscopic/ancillary
   *  text that doesn't exist yet at Gross Complete time. */
  dictatedGrossText: string;
  specimens: GrossingFitEvaluationSpecimen[];
  /** Same real grounding requirement as every other evaluation function
   *  here — candidate Grossing Template IDs the AI may choose from.
   *  Caller resolves via templateService.listTemplates('published')
   *  filtered to isDiagnostic === false, same as
   *  evaluateGrossingTemplateAssignment's own callers already do. */
  availableTemplates: Array<{ id: string; name: string; category: string }>;
  facilityId?: string;
}

export interface GrossingFitEvaluationResult {
  /** Reuses the SAME real ProtocolChange type Synoptic Stage 1 already
   *  uses and ProtocolChangeModal.tsx already renders — confirmed
   *  directly that its shape is genuinely generic (specimenId/action/
   *  templateId/templateName/reason/confidence, nothing Synoptic-specific
   *  baked in), so a real, working review UI comes for free rather than
   *  needing a parallel modal built from scratch. */
  changes: ProtocolChange[];
  warnings: string[];
}
