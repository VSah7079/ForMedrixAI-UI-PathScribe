import { describe, it, expect } from 'vitest';

// Real, working in-memory localStorage stub, same established pattern
// as jsonWebhookBuilder.test.ts - this file transitively imports
// facilityService via @/services, whose barrel eagerly initializes
// other, unrelated services (mockUserService.ts) that expect a real
// localStorage to exist at module-load time. Set up at module level,
// before the dynamic import below, since a static import is hoisted
// and would execute before any beforeEach hook ever runs.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { shouldRequireBillingApproval } = await import('./shouldRequireBillingApproval');

describe('shouldRequireBillingApproval — real, pure "absence means off" check', () => {
  it('returns true only when explicitly true', () => {
    expect(shouldRequireBillingApproval(true)).toBe(true);
  });

  it('returns false for false, null, and undefined - the real default, opt-out state', () => {
    expect(shouldRequireBillingApproval(false)).toBe(false);
    expect(shouldRequireBillingApproval(null)).toBe(false);
    expect(shouldRequireBillingApproval(undefined)).toBe(false);
  });
});
