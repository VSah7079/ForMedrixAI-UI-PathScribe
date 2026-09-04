// src/services/printSettings/IFacilityPrintSettingsService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct guidance (Workstation & Hardware redesign,
// Stage B) — the deferred Tier 2 this app's own print-settings
// architecture always anticipated (see IPrintSettingsService.ts's own
// header: "Deliberately does NOT attempt Tier 2 (workstation/device-
// level)... a real, separate piece of infrastructure").
//
// A FacilityPrintSettings record is a PARTIAL override, not a second
// full config — only the fields a facility has actually chosen to
// diverge on are ever set; everything else genuinely inherits Tier 1's
// own global default. This is what makes "System Default" vs "Facility
// Override" an honest, visible distinction in the admin UI rather than
// a second, silently-driftable full copy of every setting the moment
// any one facility touches anything.
//
// At most one real record per facility — getForFacility/create/update/
// remove all key on facilityId directly, not a separate id an admin
// would otherwise have to look up.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { PrintSettingsConfig } from './IPrintSettingsService';

export interface FacilityPrintSettings {
  id: string;
  /** Real FK to Facility.id — the one real performing lab this
   *  override applies to. Unique per facility; a second create() for
   *  the same facility is a real error, not a silent second record. */
  facilityId: string;
  /** Only the fields this facility has actually chosen to diverge from
   *  Tier 1's own global default — never a full, independent copy. */
  overrides: Partial<PrintSettingsConfig>;
  createdAt: string;
  updatedAt: string;
}

export interface IFacilityPrintSettingsService {
  getForFacility(facilityId: string): Promise<ServiceResult<FacilityPrintSettings | null>>;
  /** Real, deliberate signature: takes the FULL, starting-point
   *  overrides object up front (the admin UI seeds this from the
   *  current global values — see PrintSettingsSection.tsx's own
   *  handleCreateOverride) rather than creating an empty override and
   *  patching it — a facility choosing to override starts from a real,
   *  complete, known-good baseline, not a half-defined record with
   *  gaps silently falling through to whatever Tier 1 happens to be at
   *  read time until each field is individually touched. */
  create(facilityId: string, overrides: PrintSettingsConfig): Promise<ServiceResult<FacilityPrintSettings>>;
  update(facilityId: string, changes: Partial<PrintSettingsConfig>): Promise<ServiceResult<FacilityPrintSettings>>;
  /** Real "revert to System Default" — deletes the override record
   *  outright, not a soft-disable flag; getForFacility genuinely
   *  returns null afterward, same as a facility that never overrode
   *  anything. */
  remove(facilityId: string): Promise<ServiceResult<void>>;
}

/** Real, pure resolution — the effective config a given facility
 *  actually sees, merging Tier 1's own global default with Tier 2's
 *  override (if any). Deliberately a plain function, not a service
 *  method — the same "resolve at the call site, pass already-loaded
 *  data in" posture as resolveTatTargetHours/
 *  shouldRandomlySampleForCodeReview elsewhere in this app, so this is
 *  trivially reusable from any real consumer (this admin screen, and
 *  eventually the real print/label dispatch call sites themselves)
 *  without each one re-implementing the merge. */
export function resolveEffectivePrintSettings(
  global: PrintSettingsConfig,
  override: FacilityPrintSettings | null
): PrintSettingsConfig {
  return override ? { ...global, ...override.overrides } : global;
}
