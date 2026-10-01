import { describe, it, expect } from 'vitest';
import { canDraftOrApproveBillingCharge } from './canDraftOrApproveBillingCharge';

describe('canDraftOrApproveBillingCharge — real, direct role-string check (this app\u2019s actual, live authorization pattern)', () => {
  it('authorizes pathologist, pathologist-admin, admin, and superadmin', () => {
    expect(canDraftOrApproveBillingCharge('pathologist')).toBe(true);
    expect(canDraftOrApproveBillingCharge('pathologist-admin')).toBe(true);
    expect(canDraftOrApproveBillingCharge('admin')).toBe(true);
    expect(canDraftOrApproveBillingCharge('superadmin')).toBe(true);
  });

  it('does not authorize an unrecognized or unrelated role', () => {
    expect(canDraftOrApproveBillingCharge('resident')).toBe(false);
    expect(canDraftOrApproveBillingCharge('transcriptionist')).toBe(false);
    expect(canDraftOrApproveBillingCharge('some_future_role')).toBe(false);
  });

  it('does not authorize an undefined role', () => {
    expect(canDraftOrApproveBillingCharge(undefined)).toBe(false);
  });
});
