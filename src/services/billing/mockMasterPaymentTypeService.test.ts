// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { mockMasterPaymentTypeService } from './mockMasterPaymentTypeService';

describe('mockMasterPaymentTypeService — real seed data, per direct guidance (Outside Client Support spec, Section 3.1)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('seeds all 11 real Master Category IDs from the source specification, not a placeholder subset', async () => {
    const res = await mockMasterPaymentTypeService.getAll();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ids = res.data.map(t => t.id).sort();
    expect(ids).toEqual([
      'COMMERCIAL_INSURANCE', 'DIRECT_CONTRACT_INSTITUTIONAL', 'MUTUELLE_COMPLEMENTARY',
      'OCCUPATIONAL_WORKERS_COMP', 'PATIENT_COPAY_GAP', 'PUBLIC_NHS', 'PUBLIC_UNIVERSAL_BENEFIT',
      'RECIPROCAL_INTERNATIONAL', 'SELF_PAY', 'SPONSOR_CLINICAL_TRIAL', 'STATUTORY_SOCIAL_HEALTH',
    ].sort());
  });

  it('SELF_PAY has the real, distinct "optional" guarantor requirement — not simply true or false', async () => {
    const res = await mockMasterPaymentTypeService.getById('SELF_PAY');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.requiresGuarantor).toBe('optional');
  });

  it('PUBLIC_NHS and OCCUPATIONAL_WORKERS_COMP carry their own real, distinct subscriber-ID label', async () => {
    const nhs = await mockMasterPaymentTypeService.getById('PUBLIC_NHS');
    const wc = await mockMasterPaymentTypeService.getById('OCCUPATIONAL_WORKERS_COMP');
    expect(nhs.ok && nhs.data.subscriberIdLabel).toBe('NHS Number');
    expect(wc.ok && wc.data.subscriberIdLabel).toBe('Claim #');
  });

  it('real add/update/deactivate/reactivate cycle', async () => {
    const added = await mockMasterPaymentTypeService.add({
      id: 'TEST_CATEGORY', displayName: 'Test Category', requiresSubscriberId: false,
      requiresGuarantor: 'not_required', supportsSplitBilling: false,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.data.active).toBe(true);

    const updated = await mockMasterPaymentTypeService.update('TEST_CATEGORY', { displayName: 'Renamed' });
    expect(updated.ok && updated.data.displayName).toBe('Renamed');

    const deactivated = await mockMasterPaymentTypeService.deactivate('TEST_CATEGORY');
    expect(deactivated.ok && deactivated.data.active).toBe(false);

    const reactivated = await mockMasterPaymentTypeService.reactivate('TEST_CATEGORY');
    expect(reactivated.ok && reactivated.data.active).toBe(true);
  });

  it('a real, duplicate category id is rejected, never silently overwriting the existing one', async () => {
    const result = await mockMasterPaymentTypeService.add({
      id: 'SELF_PAY', displayName: 'Duplicate', requiresSubscriberId: false,
      requiresGuarantor: 'optional', supportsSplitBilling: false,
    });
    expect(result.ok).toBe(false);
  });
});
