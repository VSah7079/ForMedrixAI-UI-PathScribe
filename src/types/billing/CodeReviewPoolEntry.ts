// src/types/billing/CodeReviewPoolEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance - Trigger C (manual QA billing audits).
// Deliberately distinct from BillingDeficiencyRecord: this represents a
// case flagged for a billing specialist's attention, not a confirmed
// problem yet - the specialist's review may find nothing wrong at all.
// Only when review genuinely turns up an issue does a real
// BillingDeficiencyRecord get raised (raisedByTrigger:
// 'MANUAL_BILLING_AUDIT'), same as Trigger A/B's own real records.
//
// Two real sources, per direct guidance: MANUAL (a pathologist or
// staff member routes a specific case here via the same Request
// Colleague Review modal used for informal peer review - reusing that
// entry point rather than adding a new button, per direct feedback)
// and RANDOM_SAMPLE (a configurable, per-performing-lab sampling rate
// rolled at sign-out - see shouldRandomlySampleForCodeReview.ts).
// Never blocks sign-out either way - a case flagged here signs out
// completely normally.
// ─────────────────────────────────────────────────────────────────────────────

export interface CodeReviewPoolEntry {
  id: string;
  caseId: string;
  caseLabel?: string;
  source: 'MANUAL' | 'RANDOM_SAMPLE';
  /** Only meaningful for MANUAL entries - who flagged the case. */
  flaggedBy?: string;
  flaggedByName?: string;
  /** Only meaningful for MANUAL entries - the optional context note. */
  notes?: string;
  /** Only meaningful for RANDOM_SAMPLE entries - which performing lab's
   *  configured rate selected this case. */
  performingLabFacilityId?: string;
  flaggedAt: string;
  status: 'PENDING_REVIEW' | 'REVIEWED';
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  /** Real outcome of the billing specialist's actual review - the
   *  point of this whole entity. NO_ISSUE_FOUND is a genuinely valid,
   *  common outcome, not a failure to record. */
  reviewOutcome?: 'NO_ISSUE_FOUND' | 'DEFICIENCY_RAISED';
  /** Set only when reviewOutcome is DEFICIENCY_RAISED - the real,
   *  linked BillingDeficiencyRecord.id this review produced. */
  raisedDeficiencyId?: string;
}
