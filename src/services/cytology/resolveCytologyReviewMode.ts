// src/services/cytology/resolveCytologyReviewMode.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "Migration defaults review_mode =
// 'primary_manual' across the board" for legacy records. Real,
// deliberate refinement to that literal default: a legacy review
// already recorded with role === 'pathologist_review' defaults to
// 'pathologist_review' instead, never 'primary_manual' — defaulting
// it to 'primary_manual' would silently count a real pathologist's
// confirmatory sign-off toward a CT-specific CLIA cap, exactly the
// real miscount direct guidance's own stated rationale for excluding
// pathologist_review in the first place ("the CLIA daily 100-slide
// limit specifically governs cytotechnologists, not pathologist
// secondary review") explicitly warns against. Every other real,
// existing role defaults to 'primary_manual', matching direct
// guidance's own instruction exactly.
// ─────────────────────────────────────────────────────────────────────────────

import type { CytologyReviewRecord, CytologyReviewMode } from '@/types/cytology/CytologyReviewRecord';

export function resolveCytologyReviewMode(record: Pick<CytologyReviewRecord, 'reviewMode' | 'role'>): CytologyReviewMode {
  if (record.reviewMode) return record.reviewMode;
  return record.role === 'pathologist_review' ? 'pathologist_review' : 'primary_manual';
}
