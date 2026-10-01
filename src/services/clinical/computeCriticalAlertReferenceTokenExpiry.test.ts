import { describe, it, expect } from 'vitest';
import { computeCriticalAlertReferenceTokenExpiry } from './computeCriticalAlertReferenceTokenExpiry';

describe('computeCriticalAlertReferenceTokenExpiry', () => {
  it('returns a flat 168h (7 day) window regardless of weekday', () => {
    const issuedAt = new Date(2026, 8, 14, 9, 0); // Monday
    const expiry = computeCriticalAlertReferenceTokenExpiry(issuedAt);
    expect(expiry.getTime()).toBe(new Date(2026, 8, 21, 9, 0).getTime()); // Monday + 7 days
  });

  it('does not extend when the window spans a weekend (unlike the consult-token rule)', () => {
    const issuedAt = new Date(2026, 8, 18, 9, 0); // Friday
    const expiry = computeCriticalAlertReferenceTokenExpiry(issuedAt);
    expect(expiry.getTime()).toBe(new Date(2026, 8, 25, 9, 0).getTime()); // Friday + 7 days
  });

  it('is exactly 168 hours later in milliseconds', () => {
    const issuedAt = new Date(2026, 8, 19, 12, 30); // Saturday, arbitrary time
    const expiry = computeCriticalAlertReferenceTokenExpiry(issuedAt);
    expect(expiry.getTime() - issuedAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
