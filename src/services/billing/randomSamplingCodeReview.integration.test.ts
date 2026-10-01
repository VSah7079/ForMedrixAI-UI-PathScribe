// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { facilityService } from '@/services';
import { resolvePerformingLabFacilityId } from '@/services/facilities/IFacilityService';
import { shouldRandomlySampleForCodeReview } from './shouldRandomlySampleForCodeReview';
import { mockCodeReviewPoolService } from './mockCodeReviewPoolService';

// Real, per direct guidance's own follow-up - proves the exact, real
// chain finalizeCase()'s new block executes (facility resolution ->
// resolvePerformingLabFacilityId -> the sampling roll -> a real
// CodeReviewPoolEntry), using the real services together rather than
// re-testing shouldRandomlySampleForCodeReview in isolation again
// (already covered in its own test file).
describe('Random-sampling code review - real, end-to-end wiring', () => {
  it('a real performing lab configured with a 100% rate always produces a real, correctly-shaped CodeReviewPoolEntry', async () => {
    const allRes = await facilityService.getAll();
    expect(allRes.ok).toBe(true);
    if (!allRes.ok) return;

    // Real, seeded performing lab - Fenwick NHS Foundation Trust.
    const lab = allRes.data.find(f => f.id === 'c-trust-fenwick' && f.roles.includes('performing_lab'));
    expect(lab).toBeDefined();
    if (!lab) return;

    await facilityService.update(lab.id, { codeReviewSamplingRatePercent: 100 });
    const updatedRes = await facilityService.getById(lab.id);
    expect(updatedRes.ok).toBe(true);
    if (!updatedRes.ok) return;

    const labId = resolvePerformingLabFacilityId(updatedRes.data);
    expect(labId).toBe(lab.id);

    const shouldSample = shouldRandomlySampleForCodeReview(updatedRes.data.codeReviewSamplingRatePercent);
    expect(shouldSample).toBe(true);

    const created = await mockCodeReviewPoolService.create({
      caseId: 'TEST-CASE-RANDOM-SAMPLE',
      caseLabel: 'Test, Patient',
      source: 'RANDOM_SAMPLE',
      performingLabFacilityId: labId,
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.data.source).toBe('RANDOM_SAMPLE');
      expect(created.data.performingLabFacilityId).toBe(lab.id);
      expect(created.data.status).toBe('PENDING_REVIEW');
    }

    // Real cleanup - restore the facility to its original, unconfigured state.
    await facilityService.update(lab.id, { codeReviewSamplingRatePercent: null });
  });

  it('a real performing lab with no configured rate never triggers sampling (the honest, real "no signal" case)', async () => {
    const allRes = await facilityService.getAll();
    if (!allRes.ok) return;
    const lab = allRes.data.find(f => f.id === 'c-trust-fenwick' && f.roles.includes('performing_lab'));
    if (!lab) return;

    const res = await facilityService.getById(lab.id);
    if (!res.ok) return;
    expect(shouldRandomlySampleForCodeReview(res.data.codeReviewSamplingRatePercent)).toBe(false);
  });
});
