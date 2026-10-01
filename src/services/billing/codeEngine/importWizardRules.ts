// src/services/billing/codeEngine/importWizardRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-89 (Batch 334): the decisions behind System → Code Import, kept out
// of the component (standing rule 2). Pure.
// ─────────────────────────────────────────────────────────────────────────────

import { parseCsv, parseCsvRows } from '@/utils/csv';
import type { CodeVocabulary } from '@/types/billing/BillingRuleVersion';
import { EU_MEMBER_STATES } from './countryMatch';
import type { ImportRowProblem } from './planCodeImport';
import type { ColumnMapping, CodeImportField } from './csvColumnMapping';

/** The countries a code import can be scoped to, grouped the way the
 *  Billing Dictionary's own country picker groups them. */
export const IMPORT_COUNTRY_GROUPS: { operating: readonly string[]; eu: readonly string[]; other: readonly string[] } = {
  operating: ['US', 'UK', 'AU', 'CA'],
  eu: EU_MEMBER_STATES,
  other: ['NZ'],
};

/** The usual country for a coding standard; the admin can change it.
 *  Local lab codes have none: they apply wherever the lab is. */
export function defaultCountryForVocabulary(vocabulary: CodeVocabulary): string {
  switch (vocabulary) {
    case 'CPT':
    case 'HCPCS': return 'US';
    case 'NHS_OPCS4': return 'UK';
    default: return '';
  }
}

/** The file's header row and its data rows (keyed by header). */
export function readImportCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const headers = (parseCsvRows(text)[0] ?? []).filter(h => h.trim());
  return { headers, rows: parseCsv(text) };
}

/** Sets or clears one target's column. */
export function withMappedColumn(mapping: ColumnMapping, field: CodeImportField, header: string): ColumnMapping {
  const next = { ...mapping };
  if (header) next[field] = header; else delete next[field];
  return next;
}

/** Whether an import can be submitted from this preview. Refused rows
 *  block it unless the admin chose to skip them; at least one row must
 *  be importable. */
export function canSubmitImport(preview: { importable: number; problems: ImportRowProblem[] } | null, skipRefusedRows: boolean): boolean {
  if (!preview || preview.importable === 0) return false;
  return preview.problems.length === 0 || skipRefusedRows;
}

/** How many refused rows to list before summarising the rest. */
export const PROBLEM_LIST_LIMIT = 50;
