// src/utils/caseRevisionDisplay.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for turning (status, lastRevisionType) into the
// CAP-aligned display label and accent color used across HeaderBar's status
// pill, WorklistTable's status dot/card, and SearchPage's status pills.
//
// Replaces the old 'amended' CaseStatus value's display duties now that
// case status and revision kind are split — see
// AMENDMENT_STATUS_REDESIGN_BRIEF.md. A finalized case with revision
// history shows "Final (Amended)" / "Final (Corrected)" / "Final
// (Addendum)"; everything else shows the status's own label (translated
// since Batch 350).
// ─────────────────────────────────────────────────────────────────────────────
import type { RevisionType } from '@/types/reports/AmendmentRecord';

// Batch 350: labels are translated (caseStatusDisplay.* in every locale).
// They used to be English only: the revision words here, and a Title Case
// of the raw status code for everything else. The English wording is
// unchanged.
const REVISION_LABEL_KEY: Record<Exclude<RevisionType, 'original'>, string> = {
  amendment:  'caseStatusDisplay.revision.amendment',
  correction: 'caseStatusDisplay.revision.correction',
  addendum:   'caseStatusDisplay.revision.addendum',
};

const STATUS_LABEL_KEY: Record<string, string> = {
  'draft': 'caseStatusDisplay.status.draft',
  'accessioned': 'caseStatusDisplay.status.accessioned',
  'gross-complete': 'caseStatusDisplay.status.grossComplete',
  'intraoperative-complete': 'caseStatusDisplay.status.intraoperativeComplete',
  'pending-review': 'caseStatusDisplay.status.pendingReview',
  'in-progress': 'caseStatusDisplay.status.inProgress',
  'pathologist-review': 'caseStatusDisplay.status.pathologistReview',
  'finalized': 'caseStatusDisplay.status.finalized',
  'closed': 'caseStatusDisplay.status.closed',
  'returned': 'caseStatusDisplay.status.returned',
  'accepted': 'caseStatusDisplay.status.accepted',
  'ai-assisted': 'caseStatusDisplay.status.aiAssisted',
  'pool': 'caseStatusDisplay.status.pool',
  'claiming': 'caseStatusDisplay.status.claiming',
  'finalizing': 'caseStatusDisplay.status.finalizing',
  'pending-countersign': 'caseStatusDisplay.status.pendingCountersign',
  'pending-release': 'caseStatusDisplay.status.pendingRelease',
};

/** The violet accent the old 'amended' CaseStatus used to carry — reused
 *  here, keyed off revisionType instead so it survives finalized cases
 *  with real revision history. */
export const REVISION_ACCENT = { bg: 'rgba(139,92,246,0.15)', color: '#8B5CF6', border: 'rgba(139,92,246,0.3)' };

export function hasDisplayableRevision(status: string, lastRevisionType?: RevisionType): boolean {
  return status === 'finalized' && !!lastRevisionType && lastRevisionType !== 'original';
}

/** e.g. "Final (Amended)" / "Final (Corrected)" / "Final (Addendum)", or the
 *  status's own label; an unknown status code is shown in Title Case. */
export function getCaseStatusLabel(
  status: string, lastRevisionType: RevisionType | undefined, t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (hasDisplayableRevision(status, lastRevisionType)) {
    return t('caseStatusDisplay.finalWithRevision', { revision: t(REVISION_LABEL_KEY[lastRevisionType as Exclude<RevisionType, 'original'>]) });
  }
  const key = STATUS_LABEL_KEY[status];
  return key ? t(key) : status.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}
