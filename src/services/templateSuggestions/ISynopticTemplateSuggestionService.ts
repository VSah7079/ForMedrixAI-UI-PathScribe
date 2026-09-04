// src/services/templateSuggestions/ISynopticTemplateSuggestionService.ts
// ─────────────────────────────────────────────────────────────
// The diagnostic-template analog of IGrossingEvaluationService — same
// real callAi() pattern, same confidence-threshold gating, same
// fail-open error handling. Genuinely different in one respect,
// deliberately: Grossing MUST assign every specimen some processing
// route, so it fails open to a default template. Selecting a
// diagnostic synoptic template is not mandatory the same way — a
// pathologist can always browse and pick manually — so this returns
// "no confident suggestion" rather than forcing a default guess.
// A suggestion, never a silent auto-select, matching the same
// AI-drafts/pathologist-decides principle already established for
// synoptic field suggestions elsewhere in this app.
// ─────────────────────────────────────────────────────────────

export interface SynopticSuggestionSpecimenInput {
  specimenId: string;
  specimenLabel: string;
  specimenDesc?: string;
  /** From the Specimen Dictionary entry, when picked from it. */
  specimenType?: string;   // e.g. "FNA", "Cytology" — coarse procedure category
  bodySite?: string;       // e.g. "Thyroid", "Salivary Gland" — the specific field to match on
  laterality?: string;
}

export interface SynopticSuggestionInput {
  specimens: SynopticSuggestionSpecimenInput[];
  clinicalIndication?: string;
  /** Candidate diagnostic templates the AI may choose from, each with
   *  its own applicability metadata for the AI to reason against —
   *  never invent a template not in this list. */
  availableTemplates: Array<{
    id: string;
    name: string;
    category: string;
    standard?: string;
    applicability?: { specimenSites?: string[]; specimenTypes?: string[]; note?: string };
  }>;
  /** Minimum confidence (0–100) below which no suggestion is returned
   *  for that specimen at all, rather than a low-confidence guess.
   *  Defaults to 60 if omitted. */
  confidenceThreshold?: number;
  /** The case's ordering facility — needed to resolve which AI model this
   *  specific facility is actually approved to use. Optional so callers
   *  without a resolvable facility still fall back safely to the
   *  org-wide default. */
  facilityId?: string;
}

export interface SynopticTemplateSuggestion {
  specimenId: string;
  templateId: string;
  templateName: string;
  confidence: number;
  reason: string;
}

export interface SynopticSuggestionResult {
  /** One entry per specimen that cleared the confidence threshold —
   *  specimens with no confident match simply have no entry here,
   *  not a forced low-confidence one. */
  suggestions: SynopticTemplateSuggestion[];
  warnings: string[];
}
