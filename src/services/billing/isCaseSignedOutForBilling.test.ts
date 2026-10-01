import { describe, it, expect } from 'vitest';
import { isCaseSignedOutForBilling } from './isCaseSignedOutForBilling';

describe('isCaseSignedOutForBilling - real, shared business logic, extracted from duplicated UI-inline arrays', () => {
  it('true for finalized, pending-release, and closed', () => {
    expect(isCaseSignedOutForBilling('finalized')).toBe(true);
    expect(isCaseSignedOutForBilling('pending-release')).toBe(true);
    expect(isCaseSignedOutForBilling('closed')).toBe(true);
  });

  it('false for every real, pre-signout status', () => {
    expect(isCaseSignedOutForBilling('draft')).toBe(false);
    expect(isCaseSignedOutForBilling('accessioned')).toBe(false);
    expect(isCaseSignedOutForBilling('gross-complete')).toBe(false);
    expect(isCaseSignedOutForBilling('pending-review')).toBe(false);
    expect(isCaseSignedOutForBilling('in-progress')).toBe(false);
    expect(isCaseSignedOutForBilling('pathologist-review')).toBe(false);
    expect(isCaseSignedOutForBilling('pending-countersign')).toBe(false);
  });

  it('false, never assumed signed-out, for undefined or null', () => {
    expect(isCaseSignedOutForBilling(undefined)).toBe(false);
    expect(isCaseSignedOutForBilling(null)).toBe(false);
  });
});
