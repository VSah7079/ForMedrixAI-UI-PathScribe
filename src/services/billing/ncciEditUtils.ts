// src/services/billing/ncciEditUtils.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: pure parsing/checking functions, kept
// separate from mockNcciEditService.ts's own storage/import logic -
// same split codeMapTable.ts's own parseRvuUploadRows already
// established, not a new pattern invented here.
// ─────────────────────────────────────────────────────────────────────────────

import type { NcciPtpEditPair } from '@/types/billing/NcciPtpEdit';

export interface ParsedNcciUpload {
  pairs: Omit<NcciPtpEditPair, 'id'>[];
  problems: string[];
}

/** Real, per direct guidance: parses a real, uploaded PTP edit
 *  spreadsheet (the shape CMS's own "PTP Edits - Practitioner.xlsx"
 *  uses - Column One/Column Two codes, a modifier indicator, an
 *  effective date, an optional deletion date). Same real,
 *  multi-header-name tolerance parseRvuUploadRows already uses, since
 *  a customer's real download's exact column headers can vary by
 *  quarter/export tool. */
export function parseNcciUploadRows(rows: any[]): ParsedNcciUpload {
  const pairs: Omit<NcciPtpEditPair, 'id'>[] = [];
  const problems: string[] = [];

  rows.forEach((row, i) => {
    const get = (...keys: string[]) => { for (const k of keys) if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim(); return ''; };
    const columnOneCode = get('Column 1', 'Column One', 'ColumnOneCode', 'Column1', 'CPT/HCPCS Column 1');
    const columnTwoCode = get('Column 2', 'Column Two', 'ColumnTwoCode', 'Column2', 'CPT/HCPCS Column 2');
    const modifierRaw = get('Modifier Indicator', 'ModifierIndicator', 'Mod Indicator', 'MI');
    const effectiveDate = get('Effective Date', 'EffectiveDate');
    const deletionDate = get('Deletion Date', 'DeletionDate') || undefined;

    if (!columnOneCode && !columnTwoCode) return; // skip genuinely blank rows silently

    if (!columnOneCode || !columnTwoCode) {
      problems.push(`Row ${i + 2}: needs both a real Column One and Column Two code.`);
      return;
    }
    if (!['0', '1', '9'].includes(modifierRaw)) {
      problems.push(`Row ${i + 2}: "${columnOneCode}/${columnTwoCode}" needs a real modifier indicator (0, 1, or 9), got "${modifierRaw || '(blank)'}".`);
      return;
    }
    if (!effectiveDate) {
      problems.push(`Row ${i + 2}: "${columnOneCode}/${columnTwoCode}" needs a real effective date.`);
      return;
    }
    pairs.push({
      columnOneCode, columnTwoCode,
      modifierIndicator: modifierRaw as '0' | '1' | '9',
      effectiveDate, deletionDate,
    });
  });

  return { pairs, problems };
}

export interface NcciViolation {
  columnOneCode: string;
  columnTwoCode: string;
}

/** Real, per direct guidance ("alert the Pathologist with a warning
 *  message, but not block"): checks a real set of codes applied to
 *  the same specimen against the currently-loaded NCCI PTP edit
 *  table. Only modifierIndicator === '0' pairs are real, hard
 *  violations - a genuine, never-bypassable bundling conflict.
 *  modifierIndicator === '1' pairs are deliberately NOT flagged here -
 *  a real, appropriate modifier can legitimately justify reporting
 *  both, which is a real coder's judgment call, not something this
 *  function should second-guess or block. */
export function checkNcciBundling(codes: string[], pairs: NcciPtpEditPair[]): NcciViolation[] {
  const codeSet = new Set(codes);
  const violations: NcciViolation[] = [];
  for (const pair of pairs) {
    if (pair.modifierIndicator !== '0') continue;
    if (codeSet.has(pair.columnOneCode) && codeSet.has(pair.columnTwoCode)) {
      violations.push({ columnOneCode: pair.columnOneCode, columnTwoCode: pair.columnTwoCode });
    }
  }
  return violations;
}
