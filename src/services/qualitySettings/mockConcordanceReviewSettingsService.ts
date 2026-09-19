// src/services/qualitySettings/mockConcordanceReviewSettingsService.ts
import type { IConcordanceReviewSettingsService, ConcordanceReviewOrgConfig } from './IConcordanceReviewSettingsService';
import type { ServiceResult } from '../types';
import { facilityService } from '../index';
import { resolvePerformingLabFacilityId } from '../facilities/IFacilityService';
import { mockStaffConcordanceReviewOverrideService } from './mockStaffConcordanceReviewOverrideService';

/** Real, per direct decision this session ("we could make it
 *  configurable so it can be avoided" — an opt-out, not opt-in,
 *  posture): both default on. A site that never opens this config
 *  screen gets the full, real safety behavior already decided, not a
 *  silently inert feature waiting to be turned on. */
const FALLBACK_ORG_CONFIG: ConcordanceReviewOrgConfig = {
  aiComparisonEnabled: true,
  reviewScreenEnabled: true,
};
const ORG_CONFIG_STORAGE_KEY = 'pathscribe_concordance_review_org_config';

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

function readOrgConfig(): ConcordanceReviewOrgConfig {
  try {
    const stored = localStorage.getItem(ORG_CONFIG_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed?.aiComparisonEnabled === 'boolean' && typeof parsed?.reviewScreenEnabled === 'boolean') {
        return { ...FALLBACK_ORG_CONFIG, ...parsed };
      }
    }
  } catch {
    // localStorage unavailable, or a real, corrupted value — fail safe
    // toward the known-good fallback, not a thrown error.
  }
  return FALLBACK_ORG_CONFIG;
}

export const mockConcordanceReviewSettingsService: IConcordanceReviewSettingsService = {
  async getOrgDefault() {
    return ok(readOrgConfig());
  },

  async setOrgDefault(config) {
    try {
      localStorage.setItem(ORG_CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // ignore write failures — same posture as every other real
      // setOrgDefault-shaped method in this app.
    }
    return ok(undefined);
  },

  async resolveEffectiveConfigForFacility(performingFacilityId, staffUserId) {
    const orgConfig = readOrgConfig();

    let facilityLayer: ConcordanceReviewOrgConfig = orgConfig;
    if (performingFacilityId) {
      const facilityRes = await facilityService.getById(performingFacilityId);
      if (facilityRes.ok) {
        const labId = resolvePerformingLabFacilityId(facilityRes.data);
        const labRes = labId === performingFacilityId ? facilityRes : (labId ? await facilityService.getById(labId) : null);
        const override = labRes?.ok ? labRes.data.concordanceReviewSettingsOverride : undefined;
        if (override && override.inheritSystemDefault === false) {
          facilityLayer = { aiComparisonEnabled: override.aiComparisonEnabled, reviewScreenEnabled: override.reviewScreenEnabled };
        }
      }
    }

    // Real Tier 3 (staff) — most specific wins, per the same real
    // cascade resolveEffectiveCytologyQcSettings already established:
    // a partial override, applied on top of whatever the facility
    // layer above already resolved to.
    if (staffUserId) {
      const staffRes = await mockStaffConcordanceReviewOverrideService.getForStaff(staffUserId);
      if (staffRes.ok && staffRes.data) {
        return ok({ ...facilityLayer, ...staffRes.data.overrides });
      }
    }
    return ok(facilityLayer);
  },
};
