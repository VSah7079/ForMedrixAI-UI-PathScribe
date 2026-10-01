// src/services/qualitySettings/IConcordanceReviewSettingsService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up ("keep track of these settings so the
// customer can control this concordance review behavior") — the real,
// persisted settings behind the session's own "do both" decision:
// automatic frozen-vs-final discordance flagging, and the optional,
// mandatory review screen at sign-out showing Intraop vs. Final vs.
// AI outcome. Two independent booleans, per that same decision — a
// site can run the automatic comparison without forcing the extra
// screen, or the reverse, or neither.
//
// Same real org-default/facility-override shape as
// services/reportRelease/IReportReleaseService.ts's own
// ReportReleaseOrgConfig/Facility.releaseBufferOverride pair — not a
// new pattern invented for this feature. See
// Facility.concordanceReviewSettingsOverride's own doc comment
// (services/facilities/IFacilityService.ts) for the matching,
// facility-side half of this shape.
//
// Deliberately not Autopsy-specific: this governs the concordance
// review behavior broadly — the frozen-vs-final case this session
// already decided is real today, and any future PAD-vs-FAD equivalent
// once Autopsy's own report-content model exists to support one (see
// PS-292's own comment on that gap). A single, shared settings surface
// rather than one per real consumer.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export interface ConcordanceReviewOrgConfig {
  /** Whether the system automatically compares a preliminary finding
   *  (e.g. a frozen section diagnosis) against the corresponding final
   *  diagnosis and flags a real discordance for pathologist review —
   *  never auto-graded, always a human determination; this only
   *  controls whether the comparison itself runs and surfaces a flag
   *  at all. */
  aiComparisonEnabled: boolean;
  /** Whether an extra, dedicated screen appears at sign-out showing
   *  the preliminary-vs-final comparison (and the AI outcome, when
   *  aiComparisonEnabled) before the pathologist can complete sign-out
   *  — real, deliberate friction so the pathologist actively looks at
   *  the comparison rather than relying solely on whether a flag
   *  happened to fire. */
  reviewScreenEnabled: boolean;
}

export interface IConcordanceReviewSettingsService {
  getOrgDefault(): Promise<ServiceResult<ConcordanceReviewOrgConfig>>;
  setOrgDefault(config: ConcordanceReviewOrgConfig): Promise<ServiceResult<void>>;
  /** Resolves the real, effective settings for a given performing
   *  facility and, when provided, a specific staff member — most
   *  specific wins: staff override > facility override > org
   *  default. Mirrors resolveEffectiveCytologyQcSettings's own real
   *  cascade shape (services/cytology/) — the one real precedent for
   *  a third, staff-level tier in this app's own settings-cascade
   *  convention. staffUserId is optional: callers resolving a
   *  site-wide default (no specific signer in view yet) can omit it
   *  and get the same, real facility-vs-org resolution as before. */
  resolveEffectiveConfigForFacility(performingFacilityId: string | undefined, staffUserId?: string): Promise<ServiceResult<ConcordanceReviewOrgConfig>>;
}
