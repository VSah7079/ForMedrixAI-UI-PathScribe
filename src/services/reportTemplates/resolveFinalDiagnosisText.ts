// src/services/reportTemplates/resolveFinalDiagnosisText.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct correction ("a text field on the report should be
// declared as the final diagnosis... we need to audit those changes")
// — this function never guesses which field holds the real Final
// Diagnosis (no fallback to instance.comment, confirmed via direct
// investigation to have no real, dedicated editing UI at all — a
// separate, real gap this function deliberately does not paper over).
// It walks the real, live template structure (assembly → resolved
// ReportParts → each part's own real .nodes tree, confirmed directly
// against reportPart.ts's own doc comment that .nodes on the
// ReportTemplate itself is legacy/unused for assembly-mode templates)
// to find whichever node a template author explicitly marked
// isFinalDiagnosisField: true.
//
// Real, per direct guidance ("an instance can genuinely cover multiple
// specimens — concatenate all real diagnosis entries"): when the
// designated field lives inside a real repeat-group (confirmed
// directly against the authoritative render_node's own real handling
// in functions/main.py — iterateOver resolves a real array, itemAlias
// substitutes into each child's own scope), every real item's own
// non-empty value is collected and joined — never just the first,
// never silently dropped.
// ─────────────────────────────────────────────────────────────────────────────

import { mockReportTemplateService } from './mockReportTemplateService';
import { mockReportPartService } from '../reportParts/mockReportPartService';
import type { TemplateNode } from '@/types/template';

interface FoundField {
  bindingKey: string;
  /** Real, only present when this field lives inside a real
   *  repeat-group — the group's own iterateOver/itemAlias, needed to
   *  resolve every real item's own value, not just a flat lookup. */
  repeatGroup?: { iterateOver: string; itemAlias: string };
}

function findDesignatedFields(nodes: TemplateNode[], repeatGroup?: { iterateOver: string; itemAlias: string }): FoundField[] {
  const found: FoundField[] = [];
  for (const node of nodes) {
    const n = node as any;
    if (n.isFinalDiagnosisField && typeof n.bindingKey === 'string') {
      found.push({ bindingKey: n.bindingKey, repeatGroup });
    }
    if (Array.isArray(n.children)) {
      const childGroup = n.type === 'repeat-group'
        ? { iterateOver: n.iterateOver as string, itemAlias: n.itemAlias as string }
        : repeatGroup;
      found.push(...findDesignatedFields(n.children, childGroup));
    }
  }
  return found;
}

function getPath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

/** Real, per this file's own header — never falls back to any other
 *  field. A template with no real designated field, or an instance
 *  with no real value in that field, returns undefined honestly,
 *  never a fabricated or guessed string. */
export async function resolveFinalDiagnosisText(
  templateId: string,
  answers: Record<string, unknown>,
): Promise<string | undefined> {
  const templateRes = await mockReportTemplateService.getById(templateId);
  if (!templateRes.ok) return undefined;
  const template = templateRes.data;

  const partIds = (template.assembly ?? []).map(a => a.partId);
  if (partIds.length === 0) return undefined;
  const partsRes = await mockReportPartService.getByIds(partIds);
  if (!partsRes.ok) return undefined;

  const designatedFields = partsRes.data.flatMap(part => findDesignatedFields(part.nodes ?? []));
  if (designatedFields.length === 0) return undefined;

  const values: string[] = [];
  for (const field of designatedFields) {
    if (field.repeatGroup) {
      const items = getPath(answers, field.repeatGroup.iterateOver);
      if (!Array.isArray(items)) continue;
      // Real, per the authoritative render_node's own real handling —
      // the binding key is relative to the repeat-group's own alias
      // (e.g. 'specimen.diagnosis'); strip that alias prefix to get
      // the real per-item sub-key.
      const prefix = `${field.repeatGroup.itemAlias}.`;
      const subKey = field.bindingKey.startsWith(prefix) ? field.bindingKey.slice(prefix.length) : field.bindingKey;
      for (const item of items) {
        const value = getPath(item, subKey);
        if (typeof value === 'string' && value.trim()) values.push(value.trim());
      }
    } else {
      const value = getPath(answers, field.bindingKey);
      if (typeof value === 'string' && value.trim()) values.push(value.trim());
    }
  }

  return values.length > 0 ? values.join('\n\n') : undefined;
}
