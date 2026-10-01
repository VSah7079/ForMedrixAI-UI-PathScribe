// src/services/billing/IPlaceOfServiceCodeService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, deliberately simple interface - no create/approve/reject the way
// IBillingRuleService has. A Place of Service code isn't authored by any
// PathScribe admin; it's real, external CMS reference data this app
// needs to accurately reflect. Matches the simpler end of this app's own
// real dictionary spectrum (GoverningBody), not the full CRUD+overlay
// complexity of Facility or BillingRuleVersion, which genuinely are
// admin-authored/edited.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { PlaceOfServiceCode } from '@/types/billing/PlaceOfServiceCode';

export interface IPlaceOfServiceCodeService {
  /** Every real version of every real code, including RETIRED ones -
   *  the complete, real audit history. */
  getAll(): Promise<ServiceResult<PlaceOfServiceCode[]>>;
  /** Only the current, real ACTIVE version of each real code - one row
   *  per code, sorted by code. What the Facility editor's own picker
   *  actually offers. */
  getActiveCodes(): Promise<ServiceResult<PlaceOfServiceCode[]>>;
  /** Every real version of one specific code, in version order - the
   *  real, per-code audit trail. */
  getVersionsForCode(code: string): Promise<ServiceResult<PlaceOfServiceCode[]>>;
  /** The one, real current ACTIVE version of a specific code, or
   *  undefined if that code isn't real/known. */
  getActiveCode(code: string): Promise<ServiceResult<PlaceOfServiceCode | undefined>>;
}
