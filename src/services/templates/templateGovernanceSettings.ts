// src/services/templates/templateGovernanceSettings.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-63 (Batch 328): the site's template review settings, stored locally
// in this mock phase (`pathscribe_template_governance`, via mockStorage).
// Synchronous, like getSessionUser(): templateService reads them at the
// moment of an approval or publish.
//
//   Allow Template Self-Approval   default Disabled (Block)
//   Required Reviewers             default 1 independent reviewer
//
// Rules and validation are in templatePublishingRules.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { storageGet, storageSet } from '../mockStorage';
import {
  DEFAULT_TEMPLATE_GOVERNANCE, normalizeGovernanceSettings,
  type TemplateGovernanceSettings,
} from './templatePublishingRules';

export const TEMPLATE_GOVERNANCE_KEY = 'pathscribe_template_governance';

export function getTemplateGovernanceSettings(): TemplateGovernanceSettings {
  return normalizeGovernanceSettings(storageGet<Partial<TemplateGovernanceSettings>>(TEMPLATE_GOVERNANCE_KEY, DEFAULT_TEMPLATE_GOVERNANCE));
}

/** Saves the settings (normalized) and returns what was saved and what it
 *  replaced, so the caller can record the change in the audit log. */
export function setTemplateGovernanceSettings(next: Partial<TemplateGovernanceSettings>): {
  previous: TemplateGovernanceSettings;
  saved: TemplateGovernanceSettings;
} {
  const previous = getTemplateGovernanceSettings();
  const saved = normalizeGovernanceSettings({ ...previous, ...next });
  storageSet(TEMPLATE_GOVERNANCE_KEY, saved);
  return { previous, saved };
}

/** Audit-log detail for a settings change. Literal English: audit records
 *  are compliance artifacts, not UI. Null when nothing changed. */
export function governanceChangeDetail(previous: TemplateGovernanceSettings, saved: TemplateGovernanceSettings): string | null {
  const parts: string[] = [];
  if (previous.allowSelfApproval !== saved.allowSelfApproval) {
    parts.push(`Allow Template Self-Approval: ${previous.allowSelfApproval ? 'Enabled' : 'Disabled'} → ${saved.allowSelfApproval ? 'Enabled' : 'Disabled'}`);
  }
  if (previous.requiredReviewers !== saved.requiredReviewers) {
    parts.push(`Required Reviewers: ${previous.requiredReviewers} → ${saved.requiredReviewers}`);
  }
  return parts.length ? parts.join('; ') : null;
}

/** Saves the settings and records any change in the audit log. The audit
 *  service is passed in so this is testable without module mocks. */
export async function saveTemplateGovernanceWithAudit(
  next: Partial<TemplateGovernanceSettings>,
  deps: {
    auditService: { logEvent(entry: { type: 'user'; event: string; detail: string; user: string; caseId: null; confidence: null }): Promise<unknown> };
    userName: string;
  },
): Promise<TemplateGovernanceSettings> {
  const { previous, saved } = setTemplateGovernanceSettings(next);
  const detail = governanceChangeDetail(previous, saved);
  if (detail) {
    await deps.auditService.logEvent({
      type: 'user',
      event: 'Template review settings changed',
      detail,
      user: deps.userName,
      caseId: null,
      confidence: null,
    });
  }
  return saved;
}
