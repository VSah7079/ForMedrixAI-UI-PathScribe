// src/components/Worklist/amendmentGrouping.test.ts
import { describe, it, expect } from 'vitest';
import { buildAmendmentGroupRows, type AmendmentDividerRow } from './amendmentGrouping';
import type { Case } from '@/types/case/Case';

function makeCase(id: string): Case {
  return { id, status: 'finalized' } as any;
}

function dividers(rows: (Case | AmendmentDividerRow)[]): AmendmentDividerRow[] {
  return rows.filter((r): r is AmendmentDividerRow => '__divider' in r);
}

describe('buildAmendmentGroupRows — real feature, per direct follow-up: "we could segment the filter results into those subgroups... Amendment and Correction at the top followed by Addenda"', () => {
  it('groups amendment and correction cases together under one real divider', () => {
    const cases = [makeCase('S26-1'), makeCase('S26-2')];
    const typeByCaseId = new Map([['S26-1', 'amendment' as const], ['S26-2', 'correction' as const]]);
    const rows = buildAmendmentGroupRows(cases, typeByCaseId);
    const labels = dividers(rows).map(d => d.label);
    expect(labels).toEqual(['Amendment & Correction']);
    expect(dividers(rows)[0].count).toBe(2);
  });

  it('Amendment & Correction sorts before Addenda, matching the real, direct order requested', () => {
    const cases = [makeCase('S26-1'), makeCase('S26-2')];
    const typeByCaseId = new Map([['S26-1', 'addendum' as const], ['S26-2', 'amendment' as const]]);
    const rows = buildAmendmentGroupRows(cases, typeByCaseId);
    const labels = dividers(rows).map(d => d.label);
    expect(labels).toEqual(['Amendment & Correction', 'Addenda']);
  });

  it('a real, deliberate third group for unclassified LIS notices - never silently folded into Amendment or Addenda', () => {
    const cases = [makeCase('S26-1')];
    const typeByCaseId = new Map([['S26-1', 'notice' as const]]);
    const rows = buildAmendmentGroupRows(cases, typeByCaseId);
    const labels = dividers(rows).map(d => d.label);
    expect(labels).toEqual(['LIS Notices — Pending Review']);
  });

  it('LIS Notices sorts last, after both real, classified groups', () => {
    const cases = [makeCase('S26-1'), makeCase('S26-2'), makeCase('S26-3')];
    const typeByCaseId = new Map([
      ['S26-1', 'notice' as const],
      ['S26-2', 'addendum' as const],
      ['S26-3', 'correction' as const],
    ]);
    const rows = buildAmendmentGroupRows(cases, typeByCaseId);
    const labels = dividers(rows).map(d => d.label);
    expect(labels).toEqual(['Amendment & Correction', 'Addenda', 'LIS Notices — Pending Review']);
  });

  it('a real, empty group is never shown as an empty divider', () => {
    const cases = [makeCase('S26-1')];
    const typeByCaseId = new Map([['S26-1', 'addendum' as const]]);
    const rows = buildAmendmentGroupRows(cases, typeByCaseId);
    const labels = dividers(rows).map(d => d.label);
    expect(labels).toEqual(['Addenda']);
  });

  it('a case with no entry in typeByCaseId is skipped, never guessed into a group', () => {
    const cases = [makeCase('S26-1'), makeCase('S26-2')];
    const typeByCaseId = new Map([['S26-1', 'amendment' as const]]); // S26-2 deliberately missing
    const rows = buildAmendmentGroupRows(cases, typeByCaseId);
    const caseRows = rows.filter((r): r is Case => !('__divider' in r));
    expect(caseRows.map(c => c.id)).toEqual(['S26-1']);
  });

  it('a genuinely empty case list produces no dividers at all', () => {
    const rows = buildAmendmentGroupRows([], new Map());
    expect(rows).toEqual([]);
  });

  it('real counts are accurate per group with a realistic mix of all three types', () => {
    const cases = [makeCase('S26-1'), makeCase('S26-2'), makeCase('S26-3'), makeCase('S26-4'), makeCase('S26-5')];
    const typeByCaseId = new Map([
      ['S26-1', 'amendment' as const],
      ['S26-2', 'correction' as const],
      ['S26-3', 'amendment' as const],
      ['S26-4', 'addendum' as const],
      ['S26-5', 'notice' as const],
    ]);
    const rows = buildAmendmentGroupRows(cases, typeByCaseId);
    const byLabel = Object.fromEntries(dividers(rows).map(d => [d.label, d.count]));
    expect(byLabel['Amendment & Correction']).toBe(3);
    expect(byLabel['Addenda']).toBe(1);
    expect(byLabel['LIS Notices — Pending Review']).toBe(1);
  });
});
