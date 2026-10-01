// src/utils/csvExport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared CSV export helpers - extracted from pages/AuditLogPage.tsx
// (previously private to that file) so pages/BillingLogsSection.tsx can
// reuse the exact same compliance-header format for its own export,
// rather than a duplicated, driftable copy.
// ─────────────────────────────────────────────────────────────────────────────

export function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Real, per direct confirmation: `containsPatientIdentifiers` defaults
 *  to false, preserving the exact original behavior (and the exact
 *  original, honestly-true compliance claim) for every real caller
 *  whose export genuinely never includes more than a case/accession
 *  number. A caller whose export does include patient name and/or
 *  MRN/MPI must pass true - the unconditional claim would otherwise
 *  be a false compliance statement baked into a generated file. */
export function buildMetaHeader(
  reportType: string,
  requestedBy: string,
  filters: Record<string, string>,
  rowCount: number,
  containsPatientIdentifiers: boolean = false,
): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const filterStr = Object.entries(filters)
    .filter(([, v]) => v && v !== 'all')
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ') || 'None';
  return [
    `${esc('PathScribe AI — System Audit Log Export')}`,
    `${esc('NOTICE: For authorised audit and compliance purposes only. Do not distribute.')}`,
    containsPatientIdentifiers
      ? `${esc('Contains direct patient identifiers (name, MRN/MPI). Handle per your organisation\u2019s PHI policy.')}`
      : `${esc('No direct patient identifiers included (HIPAA / GDPR / Privacy Act compliant).')}`,
    ``,
    `"Report Type",${esc(reportType)}`,
    `"Exported At",${esc(now)}`,
    `"Requested By",${esc(requestedBy)}`,
    `"Active Filters",${esc(filterStr)}`,
    `"Total Records",${esc(String(rowCount))}`,
    ``,
  ].join('\n');
}
