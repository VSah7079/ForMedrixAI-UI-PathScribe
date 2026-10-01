// src/pages/SynopticReportPage/resolveEmbeddedCoding.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "when customers hook up their license, the
// CAP and RCPath synoptic reports have code metadata that should be
// applied to a case." The real, existing data model for this already
// exists — EditorField.snomed/icd (field-level) and FieldOption.snomed/icd
// (per-option), components/Config/Protocols/SynopticEditor.tsx — already
// displayed in the admin template builder/reviewer (CodingBadges,
// components/Config/Templates/TemplateRenderer.tsx), but never actually
// applied to a real case anywhere. This is that real, missing wiring.
//
// Real, per direct guidance's own workflow description: "AI will
// suggest selections to the synoptic report. The Pathologist approve
// the selection... at that point, the related codes are applied to
// the case." The real approve moment (RightSynopticPanel.tsx's own
// handleVerify, v === 'verified') is where this gets called — never
// on a transient, unconfirmed UI selection.
// ─────────────────────────────────────────────────────────────────────────────

import type { EditorField } from '@/components/Config/Protocols/SynopticEditor';

export interface ResolvedEmbeddedCode {
  system: 'SNOMED' | 'ICD';
  code: string;
  /** Real, per direct guidance: the field's own label (plus the
   *  matched option's label, when the field has options) — a real,
   *  human-readable description of what this code was actually
   *  applied FOR, not a bare code number. */
  display: string;
}

/**
 * Resolves the real, template-embedded code(s) for a specific
 * synoptic field/answer pair. A field with real options (dropdown/
 * radio/checkboxes) resolves per the SELECTED option(s) only — a
 * field's own top-level snomed/icd (meaningful for a field with no
 * options, e.g. free text/numeric) is a separate, distinct case.
 * Never returns a genuinely empty code — FieldOption/EditorField's
 * own snomed/icd are non-optional strings, defaulting to '' when an
 * admin hasn't populated them (the real, current state for every
 * generic/placeholder template today, pending a confirmed CAP/RCPath
 * license — see components/Config/Protocols/README.md's own account).
 */
export function resolveEmbeddedCodesForAnswer(
  field: EditorField,
  value: string | string[] | undefined
): ResolvedEmbeddedCode[] {
  const codes: ResolvedEmbeddedCode[] = [];

  if (field.options && field.options.length > 0) {
    const selectedIds = Array.isArray(value) ? value : (value ? [value] : []);
    for (const optId of selectedIds) {
      const opt = field.options.find(o => o.id === optId);
      if (!opt) continue;
      if (opt.snomed) codes.push({ system: 'SNOMED', code: opt.snomed, display: `${field.label}: ${opt.label}` });
      if (opt.icd)    codes.push({ system: 'ICD',    code: opt.icd,    display: `${field.label}: ${opt.label}` });
    }
    return codes;
  }

  // No real options on this field (free text/numeric/longtext) — the
  // field's own top-level code, if any, applies regardless of the
  // specific value entered, since there's no real per-value
  // granularity possible for free text.
  if (field.snomed) codes.push({ system: 'SNOMED', code: field.snomed, display: field.label });
  if (field.icd)    codes.push({ system: 'ICD',    code: field.icd,    display: field.label });
  return codes;
}

/**
 * Real, per direct guidance's own principle: appends resolved codes
 * to the target specimen's own coding — never deduplicated or
 * replacing what's already there. Every real, individual application
 * is its own, retained association (Specimen.coding.snomed's own doc
 * comment, types/case/Specimen.ts, has the full reasoning). Pure,
 * returns a new specimens array — never mutates the input.
 */
export function appendEmbeddedCodesToSpecimen(
  specimens: any[],
  targetSpecimenId: string,
  embedded: ResolvedEmbeddedCode[]
): any[] {
  const newSnomed = embedded.filter(c => c.system === 'SNOMED').map(c => ({ code: c.code, description: c.display }));
  const newIcd = embedded.filter(c => c.system === 'ICD').map(c => ({ code: c.code, description: c.display }));
  return specimens.map(sp => {
    if (sp.id !== targetSpecimenId) return sp;
    return {
      ...sp,
      coding: {
        ...(sp.coding ?? {}),
        snomed: [...(sp.coding?.snomed ?? []), ...newSnomed],
        icd10: [...(sp.coding?.icd10 ?? []), ...newIcd],
      },
    };
  });
}
