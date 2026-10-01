// src/services/reportChangeLog/exportChangeLog.ts
// Batch 368 (PS-353): exporting a case's change log to CSV, audited.
// PS-355 (Batch 369): who may export is the capability
// report:change-history:export, checked (and the check audited, naming the
// role that allowed it) before the file is built. It replaces the admin-tier
// check this used to make.

import type { IAuditService } from '../auditlog/IAuditService';
import type { IAuthorizationService } from '../authorization/authorizationService';
import { toCsv } from '@/utils/csv';
import type { ReportChangeArea, ReportChangeEntry, ReportFieldChange } from './IReportChangeLogService';
import { CHANGE_LOG_CSV_COLUMNS, changeLogRows } from './reportChangeRules';

export interface ChangeLogExportLabels {
  columns: Record<(typeof CHANGE_LOG_CSV_COLUMNS)[number], string>;
  area: (a: ReportChangeArea) => string;
  kind: (k: ReportFieldChange['kind']) => string;
}

export type ChangeLogExportResult = { ok: true; csv: string; rowCount: number } | { ok: false; reason: 'notPermitted' };

export async function exportChangeLog(
  caseId: string,
  entries: ReportChangeEntry[],
  actor: { name: string },
  labels: ChangeLogExportLabels,
  deps: { auditService: Pick<IAuditService, 'logEvent'>; authorization: Pick<IAuthorizationService, 'enforce'> },
  /** PS-356: the case's facility, for the user's facility scope (null when the case has none). */
  facilityId: string | null = null,
): Promise<ChangeLogExportResult> {
  const decision = await deps.authorization.enforce('report:change-history:export', { caseId, facilityId });
  if (!decision.allowed) return { ok: false, reason: 'notPermitted' };
  const rows = changeLogRows(entries, labels).map(r =>
    Object.fromEntries(CHANGE_LOG_CSV_COLUMNS.map(c => [labels.columns[c], r[c]])));
  const csv = toCsv(rows, CHANGE_LOG_CSV_COLUMNS.map(c => labels.columns[c]));
  // Audit detail stays literal English (audit records are compliance artifacts, not UI).
  await deps.auditService.logEvent({
    type: 'user', event: 'Report change history exported',
    detail: `${rows.length} field change(s) from ${entries.length} save(s) exported to CSV.`,
    user: actor.name, caseId, confidence: null,
  });
  return { ok: true, csv, rowCount: rows.length };
}
