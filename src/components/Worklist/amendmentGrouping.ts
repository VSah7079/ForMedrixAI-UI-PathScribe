// src/components/Worklist/amendmentGrouping.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure, testable extraction of the Worklist's Amendment & Addenda
// sub-grouping logic — same discipline as poolGrouping.ts. Real feature,
// per direct follow-up: "we could segment the filter results into those
// subgroups... Amendment and Correction at the top followed by Addenda."
//
// A real, deliberate third group this request didn't explicitly name:
// LisAmendmentNotice records ('notice') are pending_review, LIS-detected
// external changes the pathologist hasn't yet classified as any real
// revision type — forcing them into "Amendment & Correction" or "Addenda"
// would misrepresent a case that hasn't actually been decided yet.
// Sorts last, after Addenda, since it's the least-progressed state of
// the three (not yet even started, unlike an open Amendment/Correction/
// Addendum draft).
// ─────────────────────────────────────────────────────────────────────────────

import type { Case } from '@/types/case/Case';
import type { AmendmentType } from '@/types/reports/AmendmentRecord';

export type AmendmentGroupKey = 'amendment_correction' | 'addendum' | 'notice';

export type AmendmentDividerRow = {
  __divider: true;
  label: string;
  count: number;
  isAmendmentGroup: true;
  groupKey: AmendmentGroupKey;
};

const GROUP_ORDER: { key: AmendmentGroupKey; label: string }[] = [
  { key: 'amendment_correction', label: 'Amendment & Correction' },
  { key: 'addendum', label: 'Addenda' },
  { key: 'notice', label: 'LIS Notices — Pending Review' },
];

function groupKeyFor(type: AmendmentType | 'notice'): AmendmentGroupKey {
  if (type === 'amendment' || type === 'correction') return 'amendment_correction';
  if (type === 'addendum') return 'addendum';
  return 'notice';
}

/**
 * Groups the real, already-filtered Amendment & Addenda case list into
 * (in order): Amendment & Correction, Addenda, LIS Notices — Pending
 * Review. A case whose id has no entry in typeByCaseId (shouldn't
 * happen in practice — every case reaching this function was matched
 * via this same map upstream) is silently skipped rather than guessed
 * into a group.
 */
export function buildAmendmentGroupRows(
  cases: Case[],
  typeByCaseId: ReadonlyMap<string, AmendmentType | 'notice'>
): (Case | AmendmentDividerRow)[] {
  const groups = new Map<AmendmentGroupKey, Case[]>();
  for (const c of cases) {
    const type = typeByCaseId.get(c.id);
    if (!type) continue;
    const key = groupKeyFor(type);
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  const rows: (Case | AmendmentDividerRow)[] = [];
  for (const { key, label } of GROUP_ORDER) {
    const casesInGroup = groups.get(key);
    if (!casesInGroup || casesInGroup.length === 0) continue;
    rows.push({ __divider: true, label, count: casesInGroup.length, isAmendmentGroup: true, groupKey: key });
    rows.push(...casesInGroup);
  }
  return rows;
}
