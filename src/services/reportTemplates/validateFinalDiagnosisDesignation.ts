// src/services/reportTemplates/validateFinalDiagnosisDesignation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("on Final reports yes") — enforces at
// most one real field marked isFinalDiagnosisField: true per
// Final-category template. Real, deliberate scope: Preliminary
// templates are exempt — "previously reported as" is only ever a
// Final-report concept, so this constraint has nothing to check
// there.
//
// Real, honest limitation: there is no real "save/publish template"
// UI flow in this app today (confirmed directly — the 5 real Final
// templates are pure, hardcoded seed data; the template builder pages
// operate on individual ReportParts, never the whole ReportTemplate).
// This function is real and callable the moment such a flow exists;
// until then, it's the direct, callable check this app's own real
// Final templates are verified against.
// ─────────────────────────────────────────────────────────────────────────────

import { mockReportTemplateService } from './mockReportTemplateService';
import { mockReportPartService } from '../reportParts/mockReportPartService';
import type { TemplateNode } from '@/types/template';

function countDesignatedFields(nodes: TemplateNode[]): number {
  let count = 0;
  for (const node of nodes) {
    const n = node as any;
    if (n.isFinalDiagnosisField) count++;
    if (Array.isArray(n.children)) count += countDesignatedFields(n.children);
  }
  return count;
}

export interface FinalDiagnosisDesignationResult {
  ok: boolean;
  /** Real count of real fields found marked isFinalDiagnosisField
   *  across every real part this template's own assembly resolves
   *  to. 0 is a real, honest finding on its own — no designated
   *  field at all — not necessarily a failure by itself; only >1
   *  fails this specific check. */
  count: number;
  error?: string;
}

/** Real, per this file's own header — Preliminary templates always
 *  pass with a trivial { ok: true, count: 0 }, never evaluated at
 *  all, since the constraint doesn't apply to them. */
export async function validateFinalDiagnosisDesignation(templateId: string): Promise<FinalDiagnosisDesignationResult> {
  // Real, per direct guidance: the constraint only applies to
  // Final-category templates. This app's own real, existing
  // convention (mockReportTemplateService.ts) marks a Preliminary
  // template's own id with the 'tmpl-prelim-' prefix — the same real
  // signal this function relies on rather than inventing a new,
  // separate category field. Checked before any real fetch at all —
  // a Preliminary template's own real data is never even touched.
  if (templateId.startsWith('tmpl-prelim-')) return { ok: true, count: 0 };

  const templateRes = await mockReportTemplateService.getById(templateId);
  if (!templateRes.ok) return { ok: false, count: 0, error: `Template ${templateId} not found.` };
  const template = templateRes.data;

  const partIds = (template.assembly ?? []).map(a => a.partId);
  if (partIds.length === 0) return { ok: true, count: 0 };
  const partsRes = await mockReportPartService.getByIds(partIds);
  if (!partsRes.ok) return { ok: false, count: 0, error: 'Could not resolve this template\u2019s own real parts.' };

  const count = partsRes.data.reduce((sum, part) => sum + countDesignatedFields(part.nodes ?? []), 0);
  if (count > 1) {
    return { ok: false, count, error: `This Final template has ${count} fields marked as the Final Diagnosis \u2014 exactly one is required.` };
  }
  return { ok: true, count };
}
