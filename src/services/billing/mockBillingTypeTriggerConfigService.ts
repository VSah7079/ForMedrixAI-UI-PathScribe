// src/services/billing/mockBillingTypeTriggerConfigService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the Outbound Billing & Charge Event Engine epic's own
// stated acceptance criteria ("allow system administrators to specify
// default release triggers") - previously disclosed as real but
// deliberately not built (codeMapTable.ts's own header on
// BILLING_TYPE_DEFAULT_TRIGGER). Matches mockReportReleaseService.ts's
// own established org-config pattern exactly: a real fallback default,
// a real storage key, a real merge so a config saved before a future
// field is added doesn't get silently dropped.
//
// Real, per direct follow-up ("scope should be available to the
// entire set of billing configuration with a fallback to Enterprise
// settings"): restructured for real, per-site overrides, mirroring
// BillingDictionarySection.tsx's own "Viewing: Enterprise-Wide /
// [Site]" pattern exactly. A facility can legitimately want different
// release timing for its own revenue cycle process - unlike the CPT
// Modifier Dictionary or NCCI Edit Rules, which describe national
// AMA/CMS standards with no legitimate site-to-site variation, and so
// deliberately remain enterprise-wide only.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';
import type { BillingDictionaryEntry } from './RvuTableVersion';
import { BILLING_TYPE_DEFAULT_TRIGGER } from './codeMapTable';

export type BillingTypeTriggerMap = Record<BillingDictionaryEntry['billingType'], 'SPECIMEN_GROSSED' | 'CASE_SIGNED_OUT'>;

const ORG_CONFIG_STORAGE_KEY = 'pathscribe_billing_type_trigger_override';
/** Real, per-site overrides - keyed by siteId, each a real, saved
 *  partial override, same shape/merge behavior as the enterprise-wide
 *  one. Absent entirely until an admin actually configures a
 *  site-specific override. */
const SITE_CONFIG_STORAGE_KEY = 'pathscribe_billing_type_trigger_site_overrides';

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

/** Real, per direct guidance's own established pattern
 *  (mockReportReleaseService.ts's readOrgConfig) - a real, saved
 *  partial override merged onto the real default, never a full
 *  replacement, so a future new billingType (if this app ever adds
 *  one) doesn't silently lose its own real default just because an
 *  admin only ever configured TC/26/Global. */
function readEnterpriseConfig(): BillingTypeTriggerMap {
  try {
    const stored = localStorage.getItem(ORG_CONFIG_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...BILLING_TYPE_DEFAULT_TRIGGER, ...parsed };
    }
  } catch {
    // localStorage unavailable, or a real, corrupted value — fail safe
    // toward the known-good default, not a thrown error.
  }
  return BILLING_TYPE_DEFAULT_TRIGGER;
}

function readAllSiteOverrides(): Record<string, Partial<BillingTypeTriggerMap>> {
  try {
    const stored = localStorage.getItem(SITE_CONFIG_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // fail safe toward "no site overrides" rather than a thrown error.
  }
  return {};
}

export interface IBillingTypeTriggerConfigService {
  /** Real, effective trigger map for a given site - the real,
   *  enterprise-wide default (merged with any real, saved enterprise
   *  override), further merged with that site's own real, saved
   *  override if one exists. Omit siteId (or pass undefined) for the
   *  real, enterprise-wide effective map. This is what every real
   *  caller (useGrossingCompletion.ts, useSignOutWorkflow.ts) should
   *  resolve and pass into sweepChargesForOutbox, using the case's own
   *  real siteId - never BILLING_TYPE_DEFAULT_TRIGGER directly, since
   *  that would silently ignore a real, saved override at either
   *  level. */
  getEffectiveTriggerMap(siteId?: string): Promise<ServiceResult<BillingTypeTriggerMap>>;
  /** Real, per direct guidance - a full save, not a per-key patch,
   *  matching setOrgDefault's own established shape elsewhere in this
   *  app. The real admin UI is responsible for reading the current
   *  effective map first (via getEffectiveTriggerMap above) and
   *  submitting the complete, real, intended map back. Omit siteId to
   *  save the real, enterprise-wide default. */
  setTriggerOverride(map: BillingTypeTriggerMap, siteId?: string): Promise<ServiceResult<BillingTypeTriggerMap>>;
  /** Real, per direct guidance - clears the saved override for the
   *  given scope. Omit siteId to reset the enterprise-wide default
   *  back to BILLING_TYPE_DEFAULT_TRIGGER; pass a real siteId to
   *  clear just that site's own override, reverting it back to
   *  inheriting the enterprise-wide effective map. */
  resetToDefault(siteId?: string): Promise<ServiceResult<BillingTypeTriggerMap>>;
  /** Real ids of every site that currently has its own, saved
   *  override - drives the "Site Overrides" list in the admin UI so
   *  an admin can see at a glance which sites deviate from enterprise. */
  getSiteIdsWithOverrides(): Promise<ServiceResult<string[]>>;
}

export const mockBillingTypeTriggerConfigService: IBillingTypeTriggerConfigService = {
  async getEffectiveTriggerMap(siteId) {
    const enterprise = readEnterpriseConfig();
    if (!siteId) return ok(enterprise);
    const siteOverride = readAllSiteOverrides()[siteId];
    return ok(siteOverride ? { ...enterprise, ...siteOverride } : enterprise);
  },

  async setTriggerOverride(map, siteId) {
    if (!siteId) {
      try {
        localStorage.setItem(ORG_CONFIG_STORAGE_KEY, JSON.stringify(map));
      } catch {
        // ignore write failures — same posture as setOrgDefault's own
      }
      return ok(readEnterpriseConfig());
    }
    try {
      const all = readAllSiteOverrides();
      all[siteId] = map;
      localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(all));
    } catch {
      // ignore write failures — same posture as the enterprise-wide save
    }
    const enterprise = readEnterpriseConfig();
    return ok({ ...enterprise, ...map });
  },

  async resetToDefault(siteId) {
    if (!siteId) {
      try {
        localStorage.removeItem(ORG_CONFIG_STORAGE_KEY);
      } catch {
        // ignore
      }
      return ok(BILLING_TYPE_DEFAULT_TRIGGER);
    }
    try {
      const all = readAllSiteOverrides();
      delete all[siteId];
      localStorage.setItem(SITE_CONFIG_STORAGE_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
    return ok(readEnterpriseConfig());
  },

  async getSiteIdsWithOverrides() {
    return ok(Object.keys(readAllSiteOverrides()));
  },
};

