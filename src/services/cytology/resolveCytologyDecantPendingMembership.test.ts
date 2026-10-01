import { describe, it, expect } from 'vitest';
import { resolveCytologyDecantPendingMembership } from './resolveCytologyDecantPendingMembership';
import type { Decant } from '@/types/case/Material';

const decant = (stainStatuses: string[]): Decant => ({
  id: 'd1', label: 'D1', decantType: 'cell_block', createdAt: '2026-01-01',
  stains: stainStatuses.map((status, i) => ({ id: `s${i}`, stainName: 'H&E', status: status as any })),
});

describe('resolveCytologyDecantPendingMembership', () => {
  it('a real specimen with no decants at all is never pending', () => {
    expect(resolveCytologyDecantPendingMembership(undefined)).toBe(false);
    expect(resolveCytologyDecantPendingMembership([])).toBe(false);
  });

  it('a real decant with a stain still in Pending Cut is genuinely pending', () => {
    expect(resolveCytologyDecantPendingMembership([decant(['Pending Cut'])])).toBe(true);
  });

  it('a real decant where every real stain has reached Coverslipped is not pending', () => {
    expect(resolveCytologyDecantPendingMembership([decant(['Coverslipped'])])).toBe(false);
  });

  it('a real decant with a stain in QC Failed is genuinely still pending \u2014 it needs a real recut, not nothing', () => {
    expect(resolveCytologyDecantPendingMembership([decant(['QC Failed'])])).toBe(true);
  });

  it('a real, cancelled stain is treated as final, never pending', () => {
    expect(resolveCytologyDecantPendingMembership([decant(['Cancelled'])])).toBe(false);
  });

  it('a real specimen is pending if ANY one stain across ANY one decant is still outstanding, not only when all are', () => {
    const done = decant(['Coverslipped']);
    const pending = decant(['Staining']);
    expect(resolveCytologyDecantPendingMembership([done, pending])).toBe(true);
  });
});
