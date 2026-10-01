import { describe, it, expect } from 'vitest';
import { computeDefaultConsultTokenExpiry } from './computeDefaultConsultTokenExpiry';

describe('computeDefaultConsultTokenExpiry', () => {
  it('uses the plain 24h window when neither endpoint touches a weekend (Mon -> Tue)', () => {
    const issuedAt = new Date(2026, 8, 14, 9, 0); // Monday
    const expiry = computeDefaultConsultTokenExpiry(issuedAt);
    expect(expiry.getTime()).toBe(new Date(2026, 8, 15, 9, 0).getTime()); // Tuesday
  });

  it('uses the plain 24h window on a plain weekday-to-weekday case (Thu -> Fri)', () => {
    const issuedAt = new Date(2026, 8, 17, 9, 0); // Thursday
    const expiry = computeDefaultConsultTokenExpiry(issuedAt);
    expect(expiry.getTime()).toBe(new Date(2026, 8, 18, 9, 0).getTime()); // Friday
  });

  it('extends to 72h when the 24h window would land on a Saturday (Fri issuance)', () => {
    const issuedAt = new Date(2026, 8, 18, 9, 0); // Friday
    const expiry = computeDefaultConsultTokenExpiry(issuedAt);
    // 72h from Friday 9am = Monday 9am, not the naive Saturday 9am.
    expect(expiry.getTime()).toBe(new Date(2026, 8, 21, 9, 0).getTime()); // Monday
  });

  it('extends to 72h when issued on a Saturday itself', () => {
    const issuedAt = new Date(2026, 8, 19, 9, 0); // Saturday
    const expiry = computeDefaultConsultTokenExpiry(issuedAt);
    expect(expiry.getTime()).toBe(new Date(2026, 8, 22, 9, 0).getTime()); // Tuesday
  });

  it('extends to 72h when issued on a Sunday itself', () => {
    const issuedAt = new Date(2026, 8, 20, 9, 0); // Sunday
    const expiry = computeDefaultConsultTokenExpiry(issuedAt);
    expect(expiry.getTime()).toBe(new Date(2026, 8, 23, 9, 0).getTime()); // Wednesday
  });
});
