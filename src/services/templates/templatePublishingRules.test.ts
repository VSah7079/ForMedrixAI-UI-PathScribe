// src/services/templates/templatePublishingRules.test.ts — PS-63 (Batch 328).
import { describe, it, expect } from 'vitest';
import {
  calcTemplateCoverage, canDraftTemplates, countingApprovals, decideApprove, decidePublish, isTemplateApprover,
  normalizeGovernanceSettings, withEditor, DEFAULT_TEMPLATE_GOVERNANCE, SNOMED_PUBLISH_THRESHOLD,
  type GovernedTemplate, type TemplateActor,
} from './templatePublishingRules';

const field = (snomed = '', options: { snomed?: string }[] = [], icd = '') => ({ snomed, icd, options });
const AT = '2026-09-25T12:00:00.000Z';
const author: TemplateActor   = { id: 'author', name: 'Author', appRole: 'admin' };
const reviewer: TemplateActor = { id: 'rev-1', name: 'Reviewer One', roleIds: ['template-approver'] };
const reviewer2: TemplateActor = { id: 'rev-2', name: 'Reviewer Two', roleIds: ['lab-director'] };
const pathologist: TemplateActor = { id: 'path', name: 'Pathologist', appRole: 'pathologist', roleIds: ['pathologist'] };
const inReview = (over: Partial<GovernedTemplate> = {}): GovernedTemplate => ({ status: 'in_review', editorIds: ['author'], approvals: [], ...over });

describe('calcTemplateCoverage', () => {
  it('counts field-level SNOMED, ICD and answer-level coding', () => {
    const cov = calcTemplateCoverage({ sections: [{ fields: [field('1', [{ snomed: 'a' }, {}]), field('', [], 'C50'), field('2'), field('3')] }] });
    expect(cov).toEqual({ snomed: 75, icd: 25, answerLevel: 50, totalFields: 4 });
    expect(calcTemplateCoverage({ sections: [] })).toEqual({ snomed: 0, icd: 0, answerLevel: 0, totalFields: 0 });
  });
});

describe('settings and roles', () => {
  it('defaults to the safe settings and clamps stored values', () => {
    expect(normalizeGovernanceSettings(undefined)).toEqual({ allowSelfApproval: false, requiredReviewers: 1 });
    expect(normalizeGovernanceSettings({ allowSelfApproval: true, requiredReviewers: 9 })).toEqual({ allowSelfApproval: true, requiredReviewers: 3 });
    expect(normalizeGovernanceSettings({ requiredReviewers: 0 }).requiredReviewers).toBe(1);
    expect(normalizeGovernanceSettings({ requiredReviewers: 'x' as never }).requiredReviewers).toBe(1);
  });

  it('recognises Template Approver, Lab Director, Admin (by role id) and administrator accounts', () => {
    expect(isTemplateApprover(reviewer)).toBe(true);
    expect(isTemplateApprover(reviewer2)).toBe(true);
    expect(isTemplateApprover({ id: 'x', roleIds: ['admin'] })).toBe(true);
    expect(isTemplateApprover({ id: 'x', appRole: 'superadmin' })).toBe(true);
    expect(isTemplateApprover(pathologist)).toBe(false);
    expect(isTemplateApprover(null)).toBe(false);
  });

  it('lets Template Author draft, with Admin inheriting it (Batch 329)', () => {
    expect(canDraftTemplates({ id: 'a', roleIds: ['template-author'] })).toBe(true);
    expect(canDraftTemplates({ id: 'a', roleIds: ['admin'] })).toBe(true);
    expect(canDraftTemplates({ id: 'a', appRole: 'pathologist-admin' })).toBe(true);
    expect(canDraftTemplates(reviewer)).toBe(false);
    expect(canDraftTemplates(pathologist)).toBe(false);
    expect(canDraftTemplates(null)).toBe(false);
    // a Template Author can't approve
    expect(isTemplateApprover({ id: 'a', roleIds: ['template-author'] })).toBe(false);
  });

  it('records each editor once', () => {
    expect(withEditor(undefined, 'a')).toEqual(['a']);
    expect(withEditor(['a'], 'a')).toEqual(['a']);
    expect(withEditor(['a'], 'b')).toEqual(['a', 'b']);
    expect(withEditor(['a'], undefined)).toEqual(['a']);
  });
});

describe('decideApprove', () => {
  it('refuses non-approvers', () => {
    expect(decideApprove(inReview(), pathologist, DEFAULT_TEMPLATE_GOVERNANCE, AT)).toEqual({ ok: false, code: 'NOT_APPROVER' });
    expect(decideApprove(inReview(), null, DEFAULT_TEMPLATE_GOVERNANCE, AT)).toEqual({ ok: false, code: 'NOT_APPROVER' });
  });

  it('blocks an author approving their own template unless self-approval is allowed', () => {
    expect(decideApprove(inReview(), author, DEFAULT_TEMPLATE_GOVERNANCE, AT)).toEqual({ ok: false, code: 'SELF_APPROVAL' });
    const allowed = decideApprove(inReview(), author, { allowSelfApproval: true, requiredReviewers: 1 }, AT);
    expect(allowed).toMatchObject({ ok: true, status: 'approved', approvalCount: 1 });
  });

  it('treats anyone who edited the template as an author', () => {
    expect(decideApprove(inReview({ editorIds: ['author', 'rev-1'] }), reviewer, DEFAULT_TEMPLATE_GOVERNANCE, AT)).toEqual({ ok: false, code: 'SELF_APPROVAL' });
  });

  it('approves with one independent reviewer by default', () => {
    const r = decideApprove(inReview(), reviewer, DEFAULT_TEMPLATE_GOVERNANCE, AT);
    expect(r).toEqual({ ok: true, status: 'approved', approvalCount: 1, approvals: [{ userId: 'rev-1', name: 'Reviewer One', at: AT }] });
  });

  it('stays in review until the required number of different reviewers approve', () => {
    const two = { allowSelfApproval: false, requiredReviewers: 2 };
    const first = decideApprove(inReview(), reviewer, two, AT);
    expect(first).toMatchObject({ ok: true, status: 'in_review', approvalCount: 1 });
    const approvals = first.ok === true ? first.approvals : [];
    expect(decideApprove(inReview({ approvals }), reviewer, two, AT)).toEqual({ ok: false, code: 'ALREADY_APPROVED' });
    expect(decideApprove(inReview({ approvals }), reviewer2, two, AT)).toMatchObject({ ok: true, status: 'approved', approvalCount: 2 });
  });
});

describe('decidePublish', () => {
  const approved = (over: Partial<GovernedTemplate> = {}) => inReview({ status: 'approved', approvals: [{ userId: 'rev-1', name: 'R', at: AT }], ...over });

  it('publishes an independently approved template with enough SNOMED coverage', () => {
    expect(decidePublish(approved(), reviewer, DEFAULT_TEMPLATE_GOVERNANCE, SNOMED_PUBLISH_THRESHOLD)).toEqual({ ok: true });
  });

  it('blocks publishing below 80% SNOMED coverage for diagnostic templates only', () => {
    expect(decidePublish(approved(), reviewer, DEFAULT_TEMPLATE_GOVERNANCE, 79)).toEqual({ ok: false, code: 'SNOMED_BELOW_THRESHOLD', coverage: 79 });
    expect(decidePublish(approved({ isDiagnostic: false }), reviewer, DEFAULT_TEMPLATE_GOVERNANCE, 0)).toEqual({ ok: true });
  });

  it('applies Can Publish = approver ∧ (self-approval allowed ∨ not an author)', () => {
    expect(decidePublish(approved(), pathologist, DEFAULT_TEMPLATE_GOVERNANCE, 100)).toMatchObject({ ok: false, code: 'NOT_APPROVER' });
    expect(decidePublish(approved(), author, DEFAULT_TEMPLATE_GOVERNANCE, 100)).toMatchObject({ ok: false, code: 'SELF_APPROVAL' });
    const selfApproved = approved({ approvals: [{ userId: 'author', name: 'A', at: AT }] });
    expect(decidePublish(selfApproved, author, { allowSelfApproval: true, requiredReviewers: 1 }, 100)).toEqual({ ok: true });
  });

  it("doesn't count an author's own approval as independent", () => {
    const selfApproved = approved({ approvals: [{ userId: 'author', name: 'A', at: AT }] });
    expect(countingApprovals(selfApproved, DEFAULT_TEMPLATE_GOVERNANCE)).toBe(0);
    expect(decidePublish(selfApproved, reviewer, DEFAULT_TEMPLATE_GOVERNANCE, 100)).toEqual({ ok: false, code: 'NOT_ENOUGH_APPROVALS', approvalCount: 0 });
  });

  it('needs the required number of approvals', () => {
    expect(decidePublish(approved(), reviewer2, { allowSelfApproval: false, requiredReviewers: 2 }, 100)).toMatchObject({ ok: false, code: 'NOT_ENOUGH_APPROVALS', approvalCount: 1 });
  });

  it('counts a template approved before Batch 328 (no approval records) as one approval', () => {
    const legacy: GovernedTemplate = { status: 'approved', reviewedBy: 'Dr. Legacy' };
    expect(countingApprovals(legacy, DEFAULT_TEMPLATE_GOVERNANCE)).toBe(1);
    expect(decidePublish(legacy, reviewer, DEFAULT_TEMPLATE_GOVERNANCE, 100)).toEqual({ ok: true });
  });
});
