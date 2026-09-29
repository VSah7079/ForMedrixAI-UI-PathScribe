// src/services/qualityAssurance/qaExport.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-355 (Batch 369): every Quality Assurance report export goes through
// here. The report's own capability is checked (and the check audited:
// every export is high risk) before any file is produced. One capability
// per report, per Pete: exporting one QA report doesn't let you export
// another.
//
// Rows must already be PHI-safe; see components/QualityAssurance/
// qaReportUtils.ts for the export convention each tab follows.
// ─────────────────────────────────────────────────────────────────────────────

import { toCsv, downloadCsv } from '@/utils/csv';
import type { QaExportCapability } from '../authorization/capabilityCatalog';
import type { IAuthorizationService } from '../authorization/authorizationService';
import type { CapabilityContext } from '../authorization/evaluateCapability';
import type { QaScope } from './qaScope';

/**
 * PS-356 (Batch 370): the facility context of a QA export, for facility
 * scope. A client scope is that one facility; an organisation- or
 * enterprise-wide scope, or a report with no scope switcher, spans every
 * facility, so someone limited to some facilities can't export it.
 * (An organisation's own facilities aren't resolved here: refusing is the
 * safe reading.)
 */
export function qaScopeContext(scope?: QaScope): CapabilityContext {
  if (scope?.level === 'client') return { facilityIds: [scope.clientId] };
  return { allFacilities: true };
}

export type QaExportResult = { ok: true; rowCount: number } | { ok: false; reason: 'notPermitted' };

export interface QaExportDeps {
  authorization: Pick<IAuthorizationService, 'enforce'>;
  /** Hands the file to the user (defaults to a browser download). */
  deliver?: (filename: string, csv: string) => void;
}

/** Checks `capability`, then exports `rows` as CSV. `filename` may end in .csv or .xlsx; either is replaced. */
export async function exportQaReport(
  capability: QaExportCapability,
  rows: Record<string, string | number>[],
  filename: string,
  deps: QaExportDeps,
  context: CapabilityContext,
): Promise<QaExportResult> {
  const decision = await deps.authorization.enforce(capability, context);
  if (!decision.allowed) return { ok: false, reason: 'notPermitted' };
  (deps.deliver ?? downloadCsv)(filename.replace(/\.(xlsx|csv)$/i, ''), toCsv(rows));
  return { ok: true, rowCount: rows.length };
}
