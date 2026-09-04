// src/services/reportRelease/mockReportReleaseService.ts
import type { IReportReleaseService, ReleaseBufferResolution, ReportReleaseOrgConfig } from './IReportReleaseService';
import type { ServiceResult } from '../types';
import { caseRouter } from '../cases/CaseRouter';
import { mockAuditService } from '../auditlog/mockAuditService';
import { facilityService } from '../index';
import { resolvePerformingLabFacilityId } from '../facilities/IFacilityService';
import { dispatchCaseInstances } from '../reports/dispatchCaseInstances';

/** Real, sensible fallback if no org config has been saved yet — matches
 *  direct specification's own stated default (10 minutes, 1-30 range),
 *  and Phase 1's own prior behavior for enabled/bypassForStat, so an
 *  enterprise that never opens the new config screen sees no silent
 *  behavior change. Same "real, sensible fallback, never a hard
 *  failure" posture as ISessionTimeoutService's own
 *  FALLBACK_DEFAULT_MINUTES. */
const FALLBACK_ORG_CONFIG: ReportReleaseOrgConfig = {
  enabled: true,
  durationMinutes: 10,
  bypassForStat: true,
  watermarkText: 'PENDING FINAL RELEASE — DO NOT DISTRIBUTE',
  restrictHardcopyPrinting: true,
};
const ORG_CONFIG_STORAGE_KEY = 'pathscribe_release_buffer_org_config';

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

function readOrgConfig(): ReportReleaseOrgConfig {
  try {
    const stored = localStorage.getItem(ORG_CONFIG_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed?.enabled === 'boolean' && typeof parsed?.durationMinutes === 'number' && typeof parsed?.bypassForStat === 'boolean') {
        // Real, deliberate merge, not a strict all-or-nothing check: a
        // config saved before Phase 3 (watermarkText/
        // restrictHardcopyPrinting didn't exist yet) is still real and
        // valid for its own three fields — merging with the fallback's
        // real defaults for whatever's missing, rather than either
        // rejecting the whole real, saved config or leaving new fields
        // silently undefined.
        return { ...FALLBACK_ORG_CONFIG, ...parsed };
      }
    }
  } catch {
    // localStorage unavailable, or a real, corrupted value — fail safe
    // toward the known-good fallback, not a thrown error.
  }
  return FALLBACK_ORG_CONFIG;
}

export const mockReportReleaseService: IReportReleaseService = {
  async getOrgDefault() {
    return ok(readOrgConfig());
  },

  async setOrgDefault(config) {
    try {
      localStorage.setItem(ORG_CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // ignore write failures — same posture as setSessionTimeout's own
    }
    return ok(undefined);
  },

  async resolveBufferForCase(caseData): Promise<ReleaseBufferResolution> {
    const orgConfig = readOrgConfig();

    // Real, full resolution: the real, performing facility's own
    // override, if it has genuinely opted out of inheriting the org
    // default — same real resolution chain as
    // ISessionTimeoutService.resolveEffectiveMinutes(), not a new
    // pattern invented for this feature.
    let effective = orgConfig;
    if (caseData.originHospitalId) {
      const orderingRes = await facilityService.getById(caseData.originHospitalId);
      if (orderingRes.ok) {
        const labId = resolvePerformingLabFacilityId(orderingRes.data);
        if (labId) {
          const labRes = labId === caseData.originHospitalId ? orderingRes : await facilityService.getById(labId);
          if (labRes.ok) {
            const override = labRes.data.releaseBufferOverride;
            if (override && override.inheritSystemDefault === false) {
              // watermarkText/restrictHardcopyPrinting are deliberately
              // enterprise-only (see ReportReleaseOrgConfig's own doc
              // comment) — always taken from the real org config, never
              // from a facility override that doesn't carry them at all.
              effective = { ...orgConfig, enabled: override.enabled, durationMinutes: override.durationMinutes, bypassForStat: override.bypassForStat };
            }
          }
        }
      }
    }

    if (!effective.enabled) {
      return { applies: false, durationMinutes: 0, bypassReason: 'Release buffer disabled' };
    }
    // Real, existing Case.order.priority field (already real and
    // populated at accessioning) — no new concept invented for the STAT
    // bypass. Real, deliberate Phase 2 scope note: a Frozen Section
    // bypass is also named in the spec, but frozen-section status lives
    // at the specimen level (Specimen.frozenCategory), not the case
    // level — determining a real, correct case-wide bypass rule from
    // that needs a real product decision (ALL specimens frozen? ANY
    // specimen?) this phase still deliberately doesn't guess at.
    if (effective.bypassForStat && caseData.order?.priority === 'STAT') {
      return { applies: false, durationMinutes: 0, bypassReason: 'STAT priority' };
    }
    return { applies: true, durationMinutes: effective.durationMinutes };
  },

  async startBuffer(caseId, input, performedBy) {
    const current = await caseRouter.getCase(caseId);
    if (!current) return { ok: false, reason: `Case ${caseId} not found` };

    const releaseBufferExpiresAt = new Date(Date.now() + input.durationMinutes * 60_000).toISOString();
    try {
      await caseRouter.updateCase(caseId, {
        status: 'pending-release',
        releaseBufferExpiresAt,
        releaseBufferDurationMinutes: input.durationMinutes,
        preReleaseBufferStatus: input.previousStatus,
      }, current.version);

      await mockAuditService.logEvent({
        type: 'system',
        event: 'SIGN_OUT_BUFFERED',
        detail: `Report entered the post-sign-out release buffer (${input.durationMinutes} min) — recall available until real expiry.`,
        user: performedBy.userName,
        caseId,
        facilityId: current.originHospitalId,
        confidence: null,
      }).catch(() => {});

      return { ok: true, releaseBufferExpiresAt };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'Failed to start the release buffer.' };
    }
  },

  async recall(caseId, performedBy) {
    const current = await caseRouter.getCase(caseId);
    if (!current) return { ok: false, reason: `Case ${caseId} not found` };
    if (current.status !== 'pending-release') {
      return { ok: false, reason: `Case ${caseId} is not in the release buffer (current status: ${current.status}).` };
    }
    // Real feature, per direct specification, Phase 4 (spec §10 —
    // "The signing pathologist opens a case..."; spec §15b — trainees
    // and attendings can VIEW a Pending Release report, but only the
    // real, actual signer may recall it). A real, genuine bug found
    // and fixed while scoping Phase 4: caseData.finalizedBy already
    // holds the real signer's id (set unconditionally in
    // finalizeCase()'s own patch, buffer or not) — reused directly
    // here rather than a new, redundant field. Defense in depth: the
    // real UI gate lives in ReleaseBufferBanner.tsx (hides/disables the
    // button for a non-signer), but this service-layer check is what
    // actually enforces it — a caller that bypassed the UI entirely
    // still can't recall someone else's report.
    if (current.finalizedBy && current.finalizedBy !== performedBy.userId) {
      return { ok: false, reason: 'Only the pathologist who signed this report out can recall it.' };
    }
    // Real, honest race check: a real, genuine race between an
    // operator's Recall click and the countdown independently reaching
    // zero must never "recall" a report that's already release-
    // eligible — refuse outright rather than silently succeed.
    if (current.releaseBufferExpiresAt && new Date() >= new Date(current.releaseBufferExpiresAt)) {
      return { ok: false, reason: 'The release buffer has already expired — this report is release-eligible and can no longer be recalled.' };
    }

    const restoredStatus = current.preReleaseBufferStatus ?? 'in-progress';
    try {
      await caseRouter.updateCase(caseId, {
        status: restoredStatus,
        releaseBufferExpiresAt: undefined,
        releaseBufferDurationMinutes: undefined,
        preReleaseBufferStatus: undefined,
      }, current.version);

      await mockAuditService.logEvent({
        type: 'system',
        event: 'SIGN_OUT_RECALLED',
        detail: `Signed report recalled within the release buffer window — reverted to real, prior status '${restoredStatus}'.`,
        user: performedBy.userName,
        caseId,
        facilityId: current.originHospitalId,
        confidence: null,
      }).catch(() => {});

      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'Failed to recall the report.' };
    }
  },

  async checkAndReleaseIfExpired(caseId) {
    const current = await caseRouter.getCase(caseId);
    if (!current || current.status !== 'pending-release') return { released: false };
    if (!current.releaseBufferExpiresAt || new Date() < new Date(current.releaseBufferExpiresAt)) return { released: false };

    const releasedAt = new Date().toISOString();
    try {
      await caseRouter.updateCase(caseId, {
        status: 'finalized',
        releasedAt,
        releaseBufferExpiresAt: undefined,
        releaseBufferDurationMinutes: undefined,
        preReleaseBufferStatus: undefined,
      }, current.version);

      await mockAuditService.logEvent({
        type: 'system',
        event: 'RELEASE_BUFFER_EXPIRED',
        detail: `Release buffer expired — report automatically released and genuinely finalized.`,
        user: 'system-release-buffer',
        caseId,
        facilityId: current.originHospitalId,
        confidence: null,
      }).catch(() => {});

      // Real, per direct guidance (the real, deferred ORU^R01 dispatch
      // trigger this whole feature exists to protect): the actual
      // moment a signed-out case's real result(s) finally go out —
      // never before this. Fire-and-forget, deliberately never
      // awaited: a real, external network dispatch attempt (each
      // instance can take up to 15 real seconds to time out) must
      // never delay this function's own, more time-sensitive job —
      // flipping the real UI state from "buffered" to "released" for
      // whoever's watching the countdown.
      dispatchCaseInstances(caseId).catch(e =>
        console.error('[reportRelease] Real, non-blocking failure dispatching case instances after release:', e)
      );

      return { released: true };
    } catch (e) {
      // Real, deliberate no-op on failure (e.g. a real concurrency
      // conflict from an unrelated concurrent edit) rather than
      // throwing — the next real check (next timer tick, next page
      // load) will simply retry. Never leaves the countdown UI stuck
      // showing an error for what is, from the pathologist's own
      // perspective, a background process.
      console.error('[reportRelease] checkAndReleaseIfExpired failed:', e);
      return { released: false };
    }
  },
};
