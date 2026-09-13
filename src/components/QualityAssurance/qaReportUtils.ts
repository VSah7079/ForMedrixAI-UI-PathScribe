// src/components/QualityAssurance/qaReportUtils.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers for the Quality Assurance page's aggregate report tabs
// (Intraoperative Linkage, Discordance & Reconciliation). Two concerns:
//
// 1. Client/Enterprise scope resolution — no such scoping existed
//    anywhere in this app before this feature; built fresh here rather
//    than reusing something that doesn't exist yet.
// 2. PHI-safe export — deliberately stricter than AuditLog's own
//    convention (which treats accession/case numbers as "not a direct
//    patient identifier" and fine to log in-app). Once something leaves
//    as a downloaded file, none of the app's normal access controls
//    apply anymore, so exports here never include patient name, MRN, or
//    DOB — only case/accession identifiers, which are still necessary
//    for the report to be actionable (someone has to know which case to
//    go look at).
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx';

// Real, per direct follow-up: QaScope and caseMatchesScope moved to
// services/qualityAssurance/qaScope.ts — a real service must never
// depend on a type defined in components/. Re-exported here so this
// file's own seven existing real callers need no import changes.
import type { QaScope } from '@/services/qualityAssurance/qaScope';
export type { QaScope } from '@/services/qualityAssurance/qaScope';
export { caseMatchesScope } from '@/services/qualityAssurance/qaScope';

/**
 * Real, single source of truth for "what should this scope be called in
 * an export filename." Added after a real bug: when QaScope grew a third
 * 'organisation' variant, all four QA tabs' own export handlers still
 * had `scope.level === 'enterprise' ? 'enterprise' : scope.clientId`
 * inlined separately — a real type error once 'organisation' existed,
 * since that variant has no clientId at all. Fixing it once here, not
 * four times inline again, is the actual fix — the inline version is
 * exactly the kind of thing that silently drifts the next time QaScope
 * changes.
 */
export function scopeLabel(scope: QaScope): string {
  if (scope.level === 'enterprise') return 'enterprise';
  if (scope.level === 'client') return scope.clientId;
  return scope.organisationId;
}

/** Exports rows to an XLSX file, matching the exact pattern already
 *  established in ProtocolDictionarySection.tsx (XLSX.utils.json_to_sheet
 *  + XLSX.writeFile) rather than introducing a second export mechanism.
 *  Callers are responsible for making sure `rows` themselves are already
 *  PHI-safe — this function doesn't inspect or filter row content, since
 *  it has no way to know which keys are safe for a given report's shape.
 *  Each tab builds its own export rows explicitly (see
 *  IntraopLinkageTab.tsx / ReconciliationTab.tsx) rather than dumping raw
 *  service objects, specifically so nothing PHI-bearing can slip through
 *  by accident (e.g. a future field added to IntraoperativeEntry). */
export function exportQaReportRows(rows: Record<string, string | number>[], filename: string): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, filename);
}
