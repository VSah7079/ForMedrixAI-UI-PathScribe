import { ServiceResult, VoiceMacro } from '../../types';
import type { ProtocolChange } from '@/types/case/Case';

export interface AIProcessingOptions {
  context?: string;
  templateId?: string;
}

/** Structured completion for a single synoptic field */
export interface AiFieldSuggestionResult {
  value: string | string[];
  confidence: number;   // 0–100
  source: string;       // short quote from case text
}

/**
 * One specimen's worth of input for evaluateSynopticAssignment.
 */
export interface SynopticEvaluationSpecimen {
  specimenId: string;
  specimenLabel: string;
  specimenDesc: string;
  /** Currently assigned diagnostic synoptic instance(s) for this specimen, if any. */
  currentSynoptics: Array<{
    instanceId: string;
    templateId: string;
    templateName: string;
  }>;
  /**
   * This specimen's own structured Grossing answers, if available — lets
   * the evaluator react to specific answers (e.g. a DCIS-with-invasion
   * answer proposing the invasive carcinoma synoptic) without a separate
   * deterministic rule system. Optional because Stage 1 may run before
   * Grossing answers are fully structured for older/legacy cases.
   */
  grossingAnswers?: Array<{ fieldId: string; fieldLabel: string; displayValue: string }>;
}

/**
 * Input for evaluateSynopticAssignment. Deliberately NOT the full
 * StructuredContext from contextBuilder.ts — that carries patient name/
 * DOB/sex/accession, none of which this evaluation needs. Built narrow on
 * purpose: this call only needs clinical/specimen content, consistent with
 * the Pre-Launch Checklist's PHI-minimization-before-prompt-submission
 * requirement. The caller is responsible for narrowing the full case down
 * to this shape before calling.
 */
export interface SynopticEvaluationInput {
  caseText: { gross: string; microscopic: string; ancillary: string };
  specimens: SynopticEvaluationSpecimen[];
  /**
   * Candidate Synoptic Template IDs the AI may choose from when proposing
   * 'add' or 'replace' — without this, the model has nothing to ground a
   * proposed templateId against and will guess, the same failure mode
   * generateAiSuggestionsForReport avoids by passing real option IDs into
   * its prompt. Caller's responsibility to narrow the full Synoptic
   * Library down to relevant candidates (e.g. by subspecialty/category)
   * before calling — this function doesn't re-derive that list itself.
   */
  availableTemplates: Array<{ id: string; name: string; category: string }>;
  /** The case's ordering facility — needed to resolve which AI model
   *  this specific facility is actually approved to use (see
   *  resolveAiConfigOverrideForClient in
   *  components/Config/AI/resolveClientAiModel.ts — function/file name
   *  kept as-is; used by 8 other files sharing the same "Client" naming
   *  as a real, separate concern). Optional so callers without a
   *  resolvable facility (rare, but possible for internal/test paths)
   *  still fall back safely to the org-wide default. */
  facilityId?: string;
}

export interface SynopticEvaluationResult {
  changes: ProtocolChange[];
  /** Non-fatal issues — same never-hard-fail pattern as TemplateRoutingService / contextBuilder. */
  warnings: string[];
}

export interface IAIIntegrationService {
  /**
   * Refines a raw transcript into a professional pathology format.
   * Example: "Rose description" -> "Gross Description"
   */
  refineTranscript(
    text: string,
    options?: AIProcessingOptions
  ): Promise<ServiceResult<string>>;

  /**
   * Analyzes text to suggest potential new macros or shortcuts.
   */
  suggestMacros(
    text: string
  ): Promise<ServiceResult<Partial<VoiceMacro>[]>>;

  /**
   * Given case text (gross/micro/ancillary) and a list of synoptic
   * fields, returns AI-suggested values with confidence scores.
   * Used by the synoptic panel to pre-populate fields on template load.
   */
  suggestSynopticFields(
    caseText: { gross: string; microscopic: string; ancillary: string },
    fields: Array<{ id: string; label: string; options?: Array<{ id: string; label: string }> }>
  ): Promise<ServiceResult<Record<string, AiFieldSuggestionResult>>>;

  /**
   * Generates a full narrative pathology report from synoptic answers.
   */
  generateNarrative(
    system: string,
    prompt: string
  ): Promise<ServiceResult<string>>;

  /**
   * Evaluates whether each specimen's currently-assigned diagnostic
   * Synoptic Template(s) still fit, given the case's clinical text and
   * (where available) structured Grossing answers. Powers Orchestration
   * Stage 1 (Gross Complete -> first assignment, called with empty
   * currentSynoptics per specimen) and, if confirmed in scope, Stage 2
   * (Microscopic edited -> re-evaluation, called with the existing
   * assignments populated) — same method called with progressively more
   * context, not two divergent services.
   *
   * Returns proposed changes via the same ProtocolChange shape the
   * Protocol Change Review modal already renders and commits — replace /
   * add / remove, never a direct mutation of case data. The caller is
   * responsible for presenting these to the pathologist for accept/reject,
   * same as every other AI suggestion in this system; this method only
   * proposes.
   *
   * NOTE — this interface method is satisfied by MockAIIntegrationService
   * for completeness, but the REAL implementation does NOT live here.
   * Confirmed (June 2026): the actual app calls AI through plain functions
   * that call callAi() directly (see generateAiSuggestionsForReport in
   * mockCaseService.ts), not through this interface — RightSynopticPanel.tsx
   * doesn't reference IAIIntegrationService anywhere. The real
   * evaluateSynopticAssignment lives as a plain function in
   * mockCaseService.ts, matching that proven pattern. These input/result
   * types are still imported from here (type-only) to avoid duplicating
   * the shape — but don't assume this interface method is what actually
   * runs.
   */
  evaluateSynopticAssignment(
    input: SynopticEvaluationInput
  ): Promise<ServiceResult<SynopticEvaluationResult>>;
}
