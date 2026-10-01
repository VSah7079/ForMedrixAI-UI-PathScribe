// src/services/billing/codeEngine/csvColumnMapping.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-89 §9 (Batch 333): the column-mapping rules behind the CSV import
// wizard. The wizard UI itself is the next batch; these are its rules.
//
//   • Three mandatory targets: billingCode, cpt, effectiveFrom. If no
//     column maps to effectiveFrom, the user must give one fallback date
//     for the whole batch.
//   • Default auto-matching is seeded from parseRvuUploadRows' aliases
//     (codeMapTable.ts) plus the billing-rule field names.
//   • One CSV column may feed more than one target (a single "Code"
//     column usually supplies both billingCode and cpt).
// Pure.
// ─────────────────────────────────────────────────────────────────────────────

export type CodeImportField =
  | 'billingCode' | 'cpt' | 'effectiveFrom' | 'description' | 'level' | 'billingType'
  | 'hcpcsCode' | 'rvuWork' | 'rvuPe' | 'rvuMp' | 'notes';

export const REQUIRED_IMPORT_FIELDS: readonly CodeImportField[] = ['billingCode', 'cpt', 'effectiveFrom'];
export const OPTIONAL_IMPORT_FIELDS: readonly CodeImportField[] = ['description', 'level', 'billingType', 'hcpcsCode', 'rvuWork', 'rvuPe', 'rvuMp', 'notes'];

/** Target field → the CSV header it reads from. */
export type ColumnMapping = Partial<Record<CodeImportField, string>>;

const ALIASES: Record<CodeImportField, readonly string[]> = {
  billingCode:   ['Billing Code', 'BillingCode', 'billing_code', 'billingCode'],
  // From parseRvuUploadRows' code aliases.
  cpt:           ['CPT', 'CPT Code', 'CptCode', 'cpt', 'Code', 'code', 'HCPCS', 'Hcpcs'],
  effectiveFrom: ['Effective From', 'EffectiveFrom', 'effectiveFrom', 'Effective Date', 'effective_date', 'Start Date', 'Effective'],
  description:   ['Description', 'description', 'Short Description', 'Short Descriptor'],
  level:         ['Level', 'level', 'Billing Level'],
  billingType:   ['Billing Type', 'BillingType', 'billingType', 'Type'],
  hcpcsCode:     ['HCPCS Code', 'HcpcsCode', 'hcpcsCode'],
  rvuWork:       ['WorkRVU', 'workRvu', 'Work RVU', 'wRVU', 'RVU', 'Work Rvu', 'rvuWork'],
  rvuPe:         ['PE RVU', 'PeRVU', 'rvuPe', 'Practice Expense RVU'],
  rvuMp:         ['MP RVU', 'MpRVU', 'rvuMp', 'Malpractice RVU'],
  notes:         ['Notes', 'notes', 'Comment', 'Comments'],
};

/** Suggests a mapping from the file's headers. billingCode falls back to
 *  the CPT column when the file has no separate billing-code column. */
export function autoMapColumns(headers: readonly string[]): ColumnMapping {
  const byLower = new Map(headers.map(h => [h.trim().toLowerCase(), h]));
  const mapping: ColumnMapping = {};
  for (const field of [...REQUIRED_IMPORT_FIELDS, ...OPTIONAL_IMPORT_FIELDS]) {
    const hit = ALIASES[field].map(a => byLower.get(a.toLowerCase())).find(Boolean);
    if (hit) mapping[field] = hit;
  }
  // "HCPCS" is a code column alias for cpt, not the separate hcpcsCode field.
  if (mapping.hcpcsCode && mapping.hcpcsCode === mapping.cpt) delete mapping.hcpcsCode;
  if (!mapping.billingCode && mapping.cpt) mapping.billingCode = mapping.cpt;
  return mapping;
}

/** Mandatory targets still unmapped. effectiveFrom is satisfied by a
 *  batch-wide fallback date instead of a column. */
export function missingRequiredMappings(mapping: ColumnMapping, fallbackEffectiveFrom?: string): CodeImportField[] {
  return REQUIRED_IMPORT_FIELDS.filter(f => {
    if (f === 'effectiveFrom' && fallbackEffectiveFrom?.trim()) return false;
    return !mapping[f];
  });
}
