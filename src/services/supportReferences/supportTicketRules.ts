// src/services/supportReferences/supportTicketRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 364 (PS-349): what a support ticket may say about where the user was
// and what they typed, pure.
//   - supportPageOf: the page as its route pattern (/report/:caseId), never
//     the address itself, which carries the case number (or a consult token).
//     The query string is dropped. The case id is returned separately so the
//     caller can send the case's support reference instead.
//   - findIdentifiersInText: case numbers, MRNs and other identifiers in what
//     the user typed, so the ticket can warn before sending. It uses every
//     identifier format PathScribe knows (IDENTIFIER_FORMAT_LIBRARY), not just
//     those a lab has switched on: a false alarm costs a warning, a miss
//     sends patient data.
// ─────────────────────────────────────────────────────────────────────────────
import { IDENTIFIER_FORMAT_LIBRARY, type IdentifierFormat, type IdentifierKind } from '@/types/systemConfig';
import { SUPPORT_REFERENCE_IN_TEXT } from './supportReferenceRules';

/**
 * Every route in App.tsx, as written there. supportTicketRules.test.ts keeps
 * this in step with App.tsx.
 */
export const SUPPORT_ROUTE_PATTERNS: readonly string[] = [
  '/', '/login', '/auth/callback/:providerId', '/or-suite-dashboard', '/facility-ops-dashboard',
  '/consult/:token', '/critical-alert/:token', '/accession', '/worklist', '/pathology-workspace',
  '/quality-compliance', '/cytology-worklist', '/cytology-worklist/:caseId', '/molecular',
  '/molecular-batch/:batchId', '/molecular-rack', '/molecular-rack/:rackId', '/molecular-control-rules',
  '/dev/mock-interface-engine', '/quality-assurance', '/batch-management', '/batch-management/disposal',
  '/batch-management/disposal-report', '/batch-management/pending-load', '/batch-management/engraver-monitor',
  '/workstations/microtomy', '/workstations/embedding', '/workstations/slide-distribution', '/add-on-orders',
  '/intraop-queue', '/molecular-order-queue', '/cytology-qc-queue', '/surgical-qa-worklist', '/migration-jobs',
  '/search', '/audit', '/configuration', '/contribution', '/case/:caseId/synoptic', '/case/:caseId/grossing',
  '/report/:caseId', '/admin/parts/new', '/admin/parts/:partId/edit', '/admin/templates/new',
  '/admin/templates/:templateId/edit', '/template-editor/new', '/template-editor/:templateId',
  '/template-review/:templateId', '/mock-emr', '/wsi-viewer',
];

export interface SupportPage {
  /** The route pattern, e.g. '/report/:caseId'; '(other page)' when no route matches. */
  pattern: string;
  /** The case the page is about, if any: send its support reference, not this. */
  caseId?: string;
}

export function supportPageOf(pathname: string): SupportPage {
  const parts = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '').split('/').filter(Boolean);
  const candidates = SUPPORT_ROUTE_PATTERNS
    .map(p => ({ p, segs: p.split('/').filter(Boolean) }))
    .filter(({ segs }) => segs.length === parts.length)
    // literal segments beat parameters: '/admin/parts/new' before '/admin/parts/:partId/…'
    .sort((a, b) => b.segs.filter(s => !s.startsWith(':')).length - a.segs.filter(s => !s.startsWith(':')).length);
  for (const { p, segs } of candidates) {
    const params: Record<string, string> = {};
    if (segs.every((s, i) => (s.startsWith(':') ? ((params[s.slice(1)] = decodeURIComponent(parts[i])), true) : s === parts[i]))) {
      return { pattern: p, caseId: params.caseId };
    }
  }
  return { pattern: '(other page)' };
}

/** Kinds of identifier that name a patient or a case. */
const IDENTIFYING_KINDS: ReadonlySet<IdentifierKind> = new Set(['accession', 'mrn', 'requisition', 'block', 'slide']);

export interface IdentifierInText {
  text: string;
  kind: IdentifierKind;
}

/**
 * Case numbers, MRNs and other identifiers inside free text, by every known
 * format, enabled for this lab or not. Support references are not identifiers.
 */
export function findIdentifiersInText(text: string, formats: readonly IdentifierFormat[] = IDENTIFIER_FORMAT_LIBRARY): IdentifierInText[] {
  const withoutRefs = text.replace(SUPPORT_REFERENCE_IN_TEXT, ' ');
  const found = new Map<string, IdentifierInText>();
  for (const f of formats) {
    if (!IDENTIFYING_KINDS.has(f.kind)) continue;
    const body = f.pattern.replace(/^\^/, '').replace(/\$$/, '');
    let re: RegExp;
    try { re = new RegExp(`(?<![\\w-])(?:${body})(?![\\w-])`, 'gi'); } catch { continue; }
    for (const m of withoutRefs.matchAll(re)) {
      const key = m[0].toUpperCase();
      if (!found.has(key)) found.set(key, { text: m[0], kind: f.kind });
    }
  }
  return [...found.values()];
}

/** The text with each identifier replaced (e.g. a case number by its support reference). */
export function replaceIdentifiers(text: string, replacements: ReadonlyMap<string, string>): string {
  let out = text;
  for (const [from, to] of replacements) {
    out = out.replace(new RegExp(`(?<![\\w-])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'gi'), to);
  }
  return out;
}
