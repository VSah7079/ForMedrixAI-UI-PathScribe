// src/services/billing/cptModifierDictionary.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own follow-up: a modal's free-text field
// is only acceptable when no real dictionary exists to wire it to.
// BillingRuleVersion.modifiersAllowed was a plain, free-text
// comma-separated field despite a real, fixed CPT modifier set
// genuinely existing - this is that real dictionary.
//
// Real, per direct guidance's own PS-92 precedent (codeMapTable.ts's
// own header): the real modifier letters/numbers themselves aren't
// licensed content and stay accurate, but the human-readable
// description text is real, copyrighted AMA prose this app has no
// license for - synthetic "Modifier {code}" placeholders here, same
// as every other real dictionary entry in this app. A real customer
// with their own genuine AMA license imports the real descriptions
// themselves via this same screen's own quarterly upload flow (see
// ModifierDictionarySection.tsx) - PathScribe never embeds or
// redistributes the real, licensed text itself.
// ─────────────────────────────────────────────────────────────────────────────

export interface CptModifierEntry {
  code: string;
  description: string;
}

/** Real, per direct guidance's own established fallback posture
 *  (mockReportReleaseService.ts's own FALLBACK_ORG_CONFIG, etc.) - the
 *  real, fixed set of modifier codes actually relevant to anatomic
 *  pathology/laboratory billing, with honest, synthetic placeholder
 *  descriptions until a real, licensed customer imports the real
 *  text. Never the full, several-hundred-entry universal CPT modifier
 *  list - scoped to this app's own real domain. */
export interface ParsedModifierUpload {
  entries: CptModifierEntry[];
  problems: string[];
}

/** Real, per direct guidance's own established upload pattern
 *  (codeMapTable.ts's own parseRvuUploadRows) - accepts a real,
 *  uploaded spreadsheet's raw rows (Code/Description columns, case-
 *  insensitive, matching this file's own real TEMPLATE_EXAMPLE_ROWS
 *  shape) and returns real, parsed entries plus any real, honest
 *  problems found - never silently drops a malformed row. */
export function parseModifierUploadRows(rows: any[]): ParsedModifierUpload {
  const problems: string[] = [];
  const entries: CptModifierEntry[] = [];
  rows.forEach((row, i) => {
    const code = String(row.Code ?? row.code ?? '').trim();
    const description = String(row.Description ?? row.description ?? '').trim();
    if (!code) { problems.push(`Row ${i + 1}: missing a real Code value — skipped.`); return; }
    entries.push({ code, description: description || `Modifier ${code}` });
  });
  return { entries, problems };
}

export const DEFAULT_CPT_MODIFIERS: CptModifierEntry[] = [
  { code: '26', description: 'Modifier 26' },
  { code: 'TC', description: 'Modifier TC' },
  { code: '22', description: 'Modifier 22' },
  { code: '52', description: 'Modifier 52' },
  { code: '53', description: 'Modifier 53' },
  { code: '59', description: 'Modifier 59' },
  { code: 'XE', description: 'Modifier XE' },
  { code: 'XS', description: 'Modifier XS' },
  { code: 'XP', description: 'Modifier XP' },
  { code: 'XU', description: 'Modifier XU' },
  { code: '76', description: 'Modifier 76' },
  { code: '77', description: 'Modifier 77' },
  { code: '90', description: 'Modifier 90' },
  { code: '91', description: 'Modifier 91' },
  { code: '92', description: 'Modifier 92' },
];
