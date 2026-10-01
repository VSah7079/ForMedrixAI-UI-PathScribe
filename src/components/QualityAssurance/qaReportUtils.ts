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
import { authorizationService, exportQaReport, type QaExportCapability } from '@/services';
import type { CapabilityContext } from '@/services/authorization/evaluateCapability';
export { qaScopeContext } from '@/services/qualityAssurance/qaExport';

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

/** Exports rows to a CSV file (utils/csv.ts — PS-48 standardized every
 *  manual-maintenance/report export in the app on strict CSV). Callers are
 *  responsible for making sure `rows` themselves are already PHI-safe — this
 *  function doesn't inspect or filter row content, since it has no way to
 *  know which keys are safe for a given report's shape. Each tab builds its
 *  own export rows explicitly rather than dumping raw service objects, so
 *  nothing PHI-bearing can slip through by accident.
 *
 *  PS-355 (Batch 369): each report names its own capability. The export
 *  service checks it (and audits the check) before producing the file; the
 *  tab's button is greyed out for anyone without it (CapabilityButton).
 *  `filename` may end in .csv or .xlsx; either is replaced.
 *
 *  PS-356 (Batch 370): `context` is required so no export forgets facility
 *  scope: `qaScopeContext(scope)` for a tab with a scope switcher, or
 *  `qaScopeContext()` (all facilities) for one without. */
export function exportQaReportRows(capability: QaExportCapability, rows: Record<string, string | number>[], filename: string, context: CapabilityContext): Promise<unknown> {
  return exportQaReport(capability, rows, filename, { authorization: authorizationService }, context);
}
