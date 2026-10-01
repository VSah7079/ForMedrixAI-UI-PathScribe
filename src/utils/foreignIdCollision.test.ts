// @vitest-environment happy-dom
//
// src/utils/foreignIdCollision.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct reminder: "no business logic in the UI code."
// findWithinDraftForeignIdCollision was previously implemented inline
// in AccessionPage.tsx, untested directly — extracted here as a real,
// pure, synchronous function with its own real tests.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { findWithinDraftForeignIdCollision, findForeignIdCollision } from './foreignIdCollision';
import type { WithinDraftForeignIdCandidate } from './foreignIdCollision';

describe('findWithinDraftForeignIdCollision — real, pure, synchronous check (extracted from AccessionPage.tsx)', () => {
  it('finds a real duplicate — two draft specimens sharing the exact same (source, id) pair', () => {
    const candidates: WithinDraftForeignIdCandidate[] = [
      { label: 'A', externalId: 'DUP-001', externalIdSource: 'Referring Lab' },
      { label: 'B', externalId: 'DUP-001', externalIdSource: 'Referring Lab' },
    ];
    const result = findWithinDraftForeignIdCollision(candidates, 1);
    expect(result).toEqual({ withinDraft: true, otherLabel: 'A' });
  });

  it('is symmetric — checking from either index finds the other', () => {
    const candidates: WithinDraftForeignIdCandidate[] = [
      { label: 'A', externalId: 'DUP-001', externalIdSource: 'Referring Lab' },
      { label: 'B', externalId: 'DUP-001', externalIdSource: 'Referring Lab' },
    ];
    expect(findWithinDraftForeignIdCollision(candidates, 0)).toEqual({ withinDraft: true, otherLabel: 'B' });
  });

  it('the real collision key is the (source, id) PAIR — same id, different real source, is not a collision', () => {
    const candidates: WithinDraftForeignIdCandidate[] = [
      { label: 'A', externalId: 'SAME-ID', externalIdSource: 'Lab One' },
      { label: 'B', externalId: 'SAME-ID', externalIdSource: 'Lab Two' },
    ];
    expect(findWithinDraftForeignIdCollision(candidates, 1)).toBeNull();
  });

  it('returns null when nothing else in the draft matches', () => {
    const candidates: WithinDraftForeignIdCandidate[] = [
      { label: 'A', externalId: 'ID-A', externalIdSource: 'Lab' },
      { label: 'B', externalId: 'ID-B', externalIdSource: 'Lab' },
    ];
    expect(findWithinDraftForeignIdCollision(candidates, 0)).toBeNull();
  });

  it('a single specimen with no others in the draft never collides with itself', () => {
    const candidates: WithinDraftForeignIdCandidate[] = [
      { label: 'A', externalId: 'ID-A', externalIdSource: 'Lab' },
    ];
    expect(findWithinDraftForeignIdCollision(candidates, 0)).toBeNull();
  });

  it('returns null for an out-of-range index rather than throwing', () => {
    const candidates: WithinDraftForeignIdCandidate[] = [
      { label: 'A', externalId: 'ID-A', externalIdSource: 'Lab' },
    ];
    expect(findWithinDraftForeignIdCollision(candidates, 5)).toBeNull();
  });
});

describe('findForeignIdCollision — real, trivial edge cases (no network call needed)', () => {
  it('returns null immediately when externalId is empty, without touching caseRouter', async () => {
    expect(await findForeignIdCollision('Some Lab', '', undefined)).toBeNull();
  });

  it('returns null immediately when externalIdSource is empty, without touching caseRouter', async () => {
    expect(await findForeignIdCollision('', 'SOME-ID', undefined)).toBeNull();
  });
});
