// src/services/abnormalDetection/IAbnormalTriggerRuleService.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-129 (part of PS-105, Core Abnormal Detection Engine): a real,
// admin-configurable dictionary mapping a specific synoptic field/value
// combination to a severity flag. Modeled directly on the established
// DeficiencyType/ResolutionType dictionary pattern (services/deficiencies/
// IDeficiencyService.ts) — same getAll/add/update/deactivate/reactivate
// CRUD shape, same Global/scoped performingLabFacilityId convention.
//
// Real, per direct guidance: this produces a suggestion, never an
// automatic determination — see AbnormalDetectionResult's own doc
// comment below for the full reasoning (the pathologist's confirm/
// dispute action is what actually sets a case's status, not a match
// against this dictionary by itself).
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export type AbnormalSeverity = 'Abnormal' | 'Critical' | 'Malignant';

/** Real, single source of truth for ranking this app's own three-tier
 *  AbnormalSeverity scale, shared by every real caller that needs to
 *  reduce several real severity matches down to the single highest one
 *  (originally evaluateAbnormalTriggerRules.ts's own highestSeverityMatch,
 *  for PS-129's discrete synoptic triggers; PS-132's
 *  resolveCytologyAbnormalSeverity.ts reuses this exact ranking for
 *  Bethesda-severity-tagged cytology categories, rather than each
 *  caller keeping its own, potentially-drifting copy). */
export const ABNORMAL_SEVERITY_RANK: Record<AbnormalSeverity, number> = { Abnormal: 1, Critical: 2, Malignant: 3 };

/** Real, per direct guidance: shared between this file and
 *  resolveSyntheticCoding.ts (which imports it from here, avoiding a
 *  circular dependency the other direction would create) — the real,
 *  structural safety shape both the per-severity default and a
 *  per-rule override use identically. See resolveSyntheticCoding.ts's
 *  own header for the full safety reasoning. */
export interface SyntheticCodingTerm {
  system: 'TEST-SNOMED' | 'TEST-ICDO3';
  code: string;
  display: string;
}

export interface AbnormalTriggerRule {
  id: ID;
  /** The synoptic field label this rule matches against — compared to
   *  ResolvedAnswer.fieldLabel (orchestrator/contextBuilder.ts). Real
   *  text match against whatever a site's own template actually calls
   *  the field (e.g. "Margin Status"), not a fixed, hardcoded
   *  enumeration — synoptic templates are site-configurable, so this
   *  dictionary is the real place that variability gets reconciled. */
  fieldLabel: string;
  /** The specific value(s) that trigger this rule — compared against
   *  ResolvedAnswer.displayValue. Case-insensitive exact match; a
   *  field with any of these values matches. */
  triggerValues: string[];
  severity: AbnormalSeverity;
  /** Shown to admins managing this dictionary, and surfaced as part of
   *  the suggestion's own reasoning (AiFieldSuggestion.source) when a
   *  rule matches — e.g. "Positive margin status indicates residual
   *  tumor at the resection edge." */
  description?: string;
  status: 'Active' | 'Inactive';
  /** Same Global/scoped convention as DeficiencyType's own
   *  performingLabFacilityId — undefined = Global (applies to every
   *  performing lab's cases), set = only ever offered for that lab's
   *  own cases. See that field's doc comment (services/deficiencies/
   *  IDeficiencyService.ts) for the full reasoning. */
  performingLabFacilityId?: string;
  /** Real, per direct guidance: "we can use synthetic codes because we
   *  will not have a license until our first customer or a
   *  partnership" — PS-130's own real, current, INTENTIONAL approach,
   *  not just architecture testing. Same real, structural safety
   *  boundary as resolveSyntheticCoding.ts's own header (a code prefixed
   *  "TEST-" directly in the code string, never mistakable for real
   *  SNOMED/ICD-O-3 format) — admin-entered here, per-RULE rather than
   *  per-severity, since PS-130's own real scope was always about
   *  mapping a specific trigger CONDITION to a code, not a whole
   *  severity band. Exactly the field this rule's own real, licensed
   *  code will replace in place once a real terminology source exists
   *  — same "generic template, swap content in place, same id" pattern
   *  already established for CAP/RCPath's own placeholder templates
   *  (components/Config/Protocols/README.md). Optional — a rule with
   *  none configured falls back to resolveSyntheticCoding's own,
   *  severity-keyed default. */
  syntheticCoding?: SyntheticCodingTerm[];
}

export interface IAbnormalTriggerRuleService {
  getAll(): Promise<ServiceResult<AbnormalTriggerRule[]>>;
  add(rule: Omit<AbnormalTriggerRule, 'id'>): Promise<ServiceResult<AbnormalTriggerRule>>;
  update(id: ID, changes: Partial<Omit<AbnormalTriggerRule, 'id'>>): Promise<ServiceResult<AbnormalTriggerRule>>;
  deactivate(id: ID): Promise<ServiceResult<AbnormalTriggerRule>>;
  reactivate(id: ID): Promise<ServiceResult<AbnormalTriggerRule>>;
}
