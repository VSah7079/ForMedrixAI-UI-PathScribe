// src/services/templates/templatePublishingRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-63 (Batch 328): the rules for approving and publishing a synoptic
// template, per Pete's spec on PS-63.
//
//   1. SNOMED coverage. A diagnostic template can't be published below
//      80% field-level SNOMED coverage (the Review Queue banner's rule,
//      previously shown but never checked). Procedural templates
//      (isDiagnostic: false, e.g. grossing checklists) are exempt: they
//      are never coded.
//   2. Independent review.
//      Can Publish = (user has an approver role)
//                  ∧ (self-approval allowed ∨ user is not an author)
//      "Author" means anyone who authored or edited the template: every
//      saver's id is recorded in Protocol.editorIds. Approval follows the
//      same rule, and publishing also needs `requiredReviewers` approvals
//      (independent ones, unless self-approval is allowed).
//
// Site settings (TemplateGovernanceSettings), defaults are the safe ones:
//   Allow Template Self-Approval  Disabled
//   Required Reviewers            1 independent reviewer
//
//   3. Drafting (Batch 329): Template Author, with Admin inheriting it.
//
// Roles are checked by built-in role id (services/roles/systemRoles.ts).
// Pure: no storage, no session. templateService.ts supplies the protocol,
// the actor and the settings, and throws the returned code.
// ─────────────────────────────────────────────────────────────────────────────

import { SYSTEM_ROLE_IDS } from '../roles/systemRoles';

/** The part of an editor template the coverage calculation reads. */
export interface CoverageInput {
  sections: { fields: { snomed?: unknown; icd?: unknown; options: { snomed?: unknown }[] }[] }[];
}

export interface TemplateCoverage {
  /** % of fields with a field-level SNOMED code. */
  snomed: number;
  /** % of fields with an ICD code. */
  icd: number;
  /** % of answer options with a SNOMED code. */
  answerLevel: number;
  totalFields: number;
}

/** Field-level coding coverage (moved here from SynopticEditor.tsx so
 *  publishing checks the same number the editor shows). */
export function calcTemplateCoverage(template: CoverageInput): TemplateCoverage {
  const allFields = template.sections.flatMap(s => s.fields);
  const total = allFields.length;
  if (total === 0) return { snomed: 0, icd: 0, answerLevel: 0, totalFields: 0 };

  const snomedFields = allFields.filter(f => f.snomed).length;
  const icdFields    = allFields.filter(f => f.icd).length;
  const options      = allFields.flatMap(f => f.options);
  const codedOptions = options.filter(o => o.snomed).length;

  return {
    snomed:      Math.round((snomedFields / total) * 100),
    icd:         Math.round((icdFields / total) * 100),
    answerLevel: options.length > 0 ? Math.round((codedOptions / options.length) * 100) : 0,
    totalFields: total,
  };
}

/** Minimum field-level SNOMED coverage for publishing a diagnostic template. */
export const SNOMED_PUBLISH_THRESHOLD = 80;

// ── Site settings ────────────────────────────────────────────────────────────

export interface TemplateGovernanceSettings {
  /** Authors may approve and publish templates they authored or edited. */
  allowSelfApproval: boolean;
  /** Approvals needed before publishing. */
  requiredReviewers: number;
}

export const REQUIRED_REVIEWERS_MIN = 1;
export const REQUIRED_REVIEWERS_MAX = 3;

export const DEFAULT_TEMPLATE_GOVERNANCE: TemplateGovernanceSettings = {
  allowSelfApproval: false,
  requiredReviewers: 1,
};

/** Fills gaps and clamps stored settings to valid values. */
export function normalizeGovernanceSettings(raw: Partial<TemplateGovernanceSettings> | null | undefined): TemplateGovernanceSettings {
  const n = Number(raw?.requiredReviewers);
  const requiredReviewers = Number.isInteger(n)
    ? Math.min(REQUIRED_REVIEWERS_MAX, Math.max(REQUIRED_REVIEWERS_MIN, n))
    : DEFAULT_TEMPLATE_GOVERNANCE.requiredReviewers;
  return {
    allowSelfApproval: typeof raw?.allowSelfApproval === 'boolean' ? raw.allowSelfApproval : DEFAULT_TEMPLATE_GOVERNANCE.allowSelfApproval,
    requiredReviewers,
  };
}

// ── Roles ────────────────────────────────────────────────────────────────────
// Checked by built-in role id (services/roles/systemRoles.ts), never by
// display name, so renaming a role in Staff → Roles doesn't break them
// (Batch 329, per Pete).

/** Role ids that may approve and publish templates (Pete's matrix:
 *  Template Approver / Lab Director / Admin). */
export const TEMPLATE_APPROVER_ROLE_IDS: readonly string[] = [
  SYSTEM_ROLE_IDS.TEMPLATE_APPROVER, SYSTEM_ROLE_IDS.LAB_DIRECTOR, SYSTEM_ROLE_IDS.ADMIN,
];
/** Role ids that may draft templates: Template Author, and Admin by
 *  inheritance. */
export const TEMPLATE_AUTHOR_ROLE_IDS: readonly string[] = [
  SYSTEM_ROLE_IDS.TEMPLATE_AUTHOR, SYSTEM_ROLE_IDS.ADMIN,
];

/** App-level roles with administrator rights (AuthContext User.role). They
 *  inherit Admin's template rights. */
const ADMIN_APP_ROLES = new Set(['admin', 'pathologist-admin', 'superadmin']);

export interface TemplateActor {
  id: string;
  /** Display name, recorded on the approval. */
  name?: string;
  /** AuthContext User.role. */
  appRole?: string;
  /** Ids of the staff record's roles (roleIdsForNames). */
  roleIds?: string[];
}

const hasAnyRole = (actor: TemplateActor | null | undefined, ids: readonly string[]): boolean => {
  if (!actor) return false;
  if (actor.appRole && ADMIN_APP_ROLES.has(actor.appRole)) return true;
  return (actor.roleIds ?? []).some(id => ids.includes(id));
};

export function isTemplateApprover(actor: TemplateActor | null | undefined): boolean {
  return hasAnyRole(actor, TEMPLATE_APPROVER_ROLE_IDS);
}

/** Drafting (Pete's matrix): Template Author; Admin inherits it. */
export function canDraftTemplates(actor: TemplateActor | null | undefined): boolean {
  return hasAnyRole(actor, TEMPLATE_AUTHOR_ROLE_IDS);
}

// ── Approvals ────────────────────────────────────────────────────────────────

export interface TemplateApproval {
  userId: string;
  name: string;
  at: string;
}

/** The governance fields a protocol carries (see Protocol in protocolShared.tsx). */
export interface GovernedTemplate {
  status: string;
  isDiagnostic?: boolean;
  /** Everyone who authored or edited it, by user id. */
  editorIds?: string[];
  /** Approvals in the current review round. */
  approvals?: TemplateApproval[];
  /** Pre-Batch 328 approval, recorded by name only. */
  reviewedBy?: string;
}

export function isTemplateEditor(template: GovernedTemplate, userId: string): boolean {
  return (template.editorIds ?? []).includes(userId);
}

/** Adds a user to the template's editors (on every save). */
export function withEditor(editorIds: string[] | undefined, userId: string | undefined): string[] {
  const ids = editorIds ?? [];
  if (!userId || ids.includes(userId)) return ids;
  return [...ids, userId];
}

/** Approvals that count toward publishing: one per person, and not from an
 *  author unless self-approval is allowed. A template approved before
 *  Batch 328 has no approval records; its single recorded approval counts
 *  as one approval by someone who isn't known to be an author. */
export function countingApprovals(template: GovernedTemplate, settings: TemplateGovernanceSettings): number {
  if (template.approvals === undefined) {
    return template.status === 'approved' && template.reviewedBy ? 1 : 0;
  }
  const seen = new Set<string>();
  for (const a of template.approvals) {
    if (!settings.allowSelfApproval && isTemplateEditor(template, a.userId)) continue;
    seen.add(a.userId);
  }
  return seen.size;
}

export type ApproveRefusal = 'NOT_APPROVER' | 'SELF_APPROVAL' | 'ALREADY_APPROVED';
export type PublishRefusal = 'NOT_APPROVER' | 'SELF_APPROVAL' | 'NOT_ENOUGH_APPROVALS' | 'SNOMED_BELOW_THRESHOLD';

export type ApproveDecision =
  | { ok: true; approvals: TemplateApproval[]; status: 'approved' | 'in_review'; approvalCount: number }
  | { ok: false; code: ApproveRefusal };

export type PublishDecision =
  | { ok: true }
  | { ok: false; code: PublishRefusal; coverage?: number; approvalCount?: number };

function selfAndBlocked(template: GovernedTemplate, actor: TemplateActor, settings: TemplateGovernanceSettings): boolean {
  return !settings.allowSelfApproval && isTemplateEditor(template, actor.id);
}

/** Decides an Approve. The template becomes 'approved' once it has enough
 *  counting approvals; until then it stays in review for the next reviewer. */
export function decideApprove(
  template: GovernedTemplate,
  actor: TemplateActor | null,
  settings: TemplateGovernanceSettings,
  at: string,
): ApproveDecision {
  if (!actor || !isTemplateApprover(actor)) return { ok: false, code: 'NOT_APPROVER' };
  if (selfAndBlocked(template, actor, settings)) return { ok: false, code: 'SELF_APPROVAL' };
  const existing = template.approvals ?? [];
  if (existing.some(a => a.userId === actor.id)) return { ok: false, code: 'ALREADY_APPROVED' };

  const approvals = [...existing, { userId: actor.id, name: actor.name ?? actor.id, at }];
  const approvalCount = countingApprovals({ ...template, approvals }, settings);
  return {
    ok: true,
    approvals,
    approvalCount,
    status: approvalCount >= settings.requiredReviewers ? 'approved' : 'in_review',
  };
}

/** Decides a Publish. `snomedCoverage` is the template's field-level
 *  SNOMED % (calcTemplateCoverage). */
export function decidePublish(
  template: GovernedTemplate,
  actor: TemplateActor | null,
  settings: TemplateGovernanceSettings,
  snomedCoverage: number,
): PublishDecision {
  if (!actor || !isTemplateApprover(actor)) return { ok: false, code: 'NOT_APPROVER' };
  if (selfAndBlocked(template, actor, settings)) return { ok: false, code: 'SELF_APPROVAL' };
  const approvalCount = countingApprovals(template, settings);
  if (approvalCount < settings.requiredReviewers) return { ok: false, code: 'NOT_ENOUGH_APPROVALS', approvalCount };
  if (template.isDiagnostic !== false && snomedCoverage < SNOMED_PUBLISH_THRESHOLD) {
    return { ok: false, code: 'SNOMED_BELOW_THRESHOLD', coverage: snomedCoverage };
  }
  return { ok: true };
}
