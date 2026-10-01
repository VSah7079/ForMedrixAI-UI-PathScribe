// src/services/reportChangeLog/reportChangeRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 368 (PS-353): what changed between two versions of a case, for the
// report change log. Pure functions; the service and screens call these.
//
//   diffCaseChanges(before, after, keys)  field-level changes, by area
//   wordDiff(before, after)                word-level diff for long text
//   changeLogRows(entries)                 flat rows for CSV export
//
// Who may export is the capability report:change-history:export (PS-355,
// Batch 369), checked by exportChangeLog through the authorization service.
// canExportChangeLog, the admin-tier stand-in, is gone.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReportChangeArea, ReportChangeEntry, ReportFieldChange } from './IReportChangeLogService';

/** Bookkeeping the store writes on every save; never a change to the report. */
const IGNORED_KEYS = new Set(['id', 'version', 'updatedAt', 'createdAt', 'lastUpdatedFromStation', 'eligibleFinalizerIds', 'firstOpenedAt']);
/** The same bookkeeping inside records (a report instance's own updatedAt). */
const IGNORED_NESTED_KEYS = new Set(['updatedAt', 'createdAt', 'lastUpdatedAt', 'lastSavedAt', 'lastUpdatedFromStation', 'version']);
/** Top-level keys the area badge already names; the screen leaves them out of the path. */
export const AREA_ROOT_KEYS = new Set(['synopticReports', 'specimens', 'diagnostic', 'coding', 'grossingReports', 'microscopicReports']);

const AREA_BY_KEY: Record<string, ReportChangeArea> = {
  synopticReports: 'synoptic', synopticAnswers: 'synoptic', synopticTemplateId: 'synoptic', pendingProtocolChanges: 'synoptic',
  grossingReports: 'narrative', microscopicReports: 'narrative', diagnostic: 'narrative', autopsy: 'narrative',
  coding: 'codes', syntheticAbnormalCoding: 'codes',
  specimens: 'specimens', matrixBlocks: 'specimens',
};
/** Nested keys that hold codes, wherever they sit (a specimen's SNOMED codes are codes, not specimen data). */
const CODE_KEYS = /^(codes|snomed|snomedCodes|icd|icd10|icd11|icdO|icdo|loinc|cpt|cptCodes|billingCodes|appliedCodes)$/i;

const ID_KEYS = ['id', 'instanceId', 'specimenId', 'blockId', 'slideId', 'code'] as const;
const LABEL_KEYS = ['label', 'templateName', 'name', 'title', 'displayName', 'code', 'id', 'instanceId'] as const;

type Json = unknown;
const isRecord = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isEmpty = (v: Json) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

const keyOf = (el: Json, i: number): string => {
  if (isRecord(el)) for (const k of ID_KEYS) if (typeof el[k] === 'string' || typeof el[k] === 'number') return `${k}:${el[k]}`;
  return `#${i}`;
};
export const labelOf = (el: Json, fallback: string): string => {
  if (isRecord(el)) {
    const label = LABEL_KEYS.map(k => el[k]).find(v => typeof v === 'string' && v.trim());
    if (typeof label === 'string') {
      const letter = typeof el.specimenLetter === 'string' ? el.specimenLetter : typeof el.letter === 'string' ? el.letter : null;
      return letter && !label.startsWith(letter) ? `${letter}: ${label}` : label;
    }
  }
  return fallback;
};

/** A value as the plain text the log shows and exports. */
export const displayValue = (v: Json): string | null => {
  if (isEmpty(v)) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.every(x => !isRecord(x) && !Array.isArray(x)) ? v.map(x => String(x)).join(', ') : v.map((x, i) => labelOf(x, `#${i + 1}`)).join(', ');
  if (isRecord(v)) return labelOf(v, JSON.stringify(v));
  return String(v);
};

const isPrimitiveList = (v: Json) => Array.isArray(v) && v.every(x => !isRecord(x) && !Array.isArray(x));

function walk(area: ReportChangeArea, path: string[], before: Json, after: Json, out: ReportFieldChange[]): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const here = path[path.length - 1] ?? '';
  const areaHere: ReportChangeArea = CODE_KEYS.test(here) ? 'codes' : area;

  // Whole records added or removed, and scalars / plain lists changed.
  if (isEmpty(before) && !isEmpty(after) && (isRecord(after) || (Array.isArray(after) && !isPrimitiveList(after)))) {
    if (Array.isArray(after)) after.forEach((el, i) => out.push({ area: areaHere, path: [...path, labelOf(el, `#${i + 1}`)], kind: 'added', before: null, after: displayValue(el) }));
    else out.push({ area: areaHere, path, kind: 'added', before: null, after: displayValue(after) });
    return;
  }
  if (!isEmpty(before) && isEmpty(after) && (isRecord(before) || (Array.isArray(before) && !isPrimitiveList(before)))) {
    if (Array.isArray(before)) before.forEach((el, i) => out.push({ area: areaHere, path: [...path, labelOf(el, `#${i + 1}`)], kind: 'removed', before: displayValue(el), after: null }));
    else out.push({ area: areaHere, path, kind: 'removed', before: displayValue(before), after: null });
    return;
  }
  if (Array.isArray(before) && Array.isArray(after) && !(isPrimitiveList(before) && isPrimitiveList(after))) {
    const b = new Map(before.map((el, i) => [keyOf(el, i), el]));
    const a = new Map(after.map((el, i) => [keyOf(el, i), el]));
    for (const [k, el] of a) {
      const label = labelOf(el, `#${after.indexOf(el) + 1}`);
      if (!b.has(k)) out.push({ area: CODE_KEYS.test(here) ? 'codes' : areaHere, path: [...path, label], kind: 'added', before: null, after: displayValue(el) });
      else walk(areaHere, [...path, label], b.get(k), el, out);
    }
    for (const [k, el] of b) if (!a.has(k)) out.push({ area: areaHere, path: [...path, labelOf(el, `#${before.indexOf(el) + 1}`)], kind: 'removed', before: displayValue(el), after: null });
    return;
  }
  if (isRecord(before) && isRecord(after)) {
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) if (!IGNORED_NESTED_KEYS.has(k)) walk(areaHere, [...path, k], before[k], after[k], out);
    return;
  }
  const bv = displayValue(before), av = displayValue(after);
  if (bv === av) return;
  out.push({ area: areaHere, path, kind: bv === null ? 'added' : av === null ? 'removed' : 'changed', before: bv, after: av });
}

/** The field-level changes a save makes. `keys` are the fields the save wrote. */
export function diffCaseChanges(before: Record<string, Json>, after: Record<string, Json>, keys: Iterable<string>): ReportFieldChange[] {
  const out: ReportFieldChange[] = [];
  for (const key of new Set(keys)) {
    if (IGNORED_KEYS.has(key)) continue;
    walk(AREA_BY_KEY[key] ?? 'case', [key], before[key], after[key], out);
  }
  return out;
}

// ── Word-level diff ────────────────────────────────────────────────────────────

export interface WordDiffPart { op: 'same' | 'removed' | 'added'; text: string }

/** Long text is shown as a word diff; short values as old → new. */
export const isLongText = (before: string | null, after: string | null) =>
  [before, after].some(v => typeof v === 'string' && (v.length > 60 || v.trim().split(/\s+/).length > 6));

/** Word-level diff (longest common subsequence over words and spaces).
 *  Very long texts fall back to a whole replacement. */
export function wordDiff(before: string, after: string, maxTokens = 3000): WordDiffPart[] {
  const a = before.match(/\s+|[^\s]+/g) ?? [];
  const b = after.match(/\s+|[^\s]+/g) ?? [];
  if (a.length > maxTokens || b.length > maxTokens) return ([{ op: 'removed', text: before }, { op: 'added', text: after }] as WordDiffPart[]).filter(p => p.text);
  const n = a.length, m = b.length;
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const parts: WordDiffPart[] = [];
  const push = (op: WordDiffPart['op'], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.op === op) last.text += text; else parts.push({ op, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('same', a[i]); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) push('removed', a[i++]);
    else push('added', b[j++]);
  }
  while (i < n) push('removed', a[i++]);
  while (j < m) push('added', b[j++]);
  return parts;
}

// ── Export ─────────────────────────────────────────────────────────────────────

export const CHANGE_LOG_CSV_COLUMNS = ['savedAt', 'user', 'workstation', 'area', 'field', 'change', 'before', 'after'] as const;
export type ChangeLogCsvRow = Record<(typeof CHANGE_LOG_CSV_COLUMNS)[number], string>;

/** One row per changed field. Labels (area, change kind) come from the caller. */
export function changeLogRows(
  entries: ReportChangeEntry[],
  label: { area: (a: ReportChangeArea) => string; kind: (k: ReportFieldChange['kind']) => string },
): ChangeLogCsvRow[] {
  return entries.flatMap(e => e.changes.map(c => ({
    savedAt: e.at, user: e.userName, workstation: e.stationId ?? '',
    area: label.area(c.area), field: c.path.join(' › '), change: label.kind(c.kind),
    before: neutraliseFormula(c.before ?? ''), after: neutraliseFormula(c.after ?? ''),
  })));
}

/** Spreadsheet apps run a cell that starts with = + - @ as a formula. */
const neutraliseFormula = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);

// ── Synoptic labels ────────────────────────────────────────────────────────────

/** The part of a synoptic template the log needs: field and option labels. */
export interface SynopticLabelSource {
  sections: { fields: { id: string; label: string; options?: { id: string; label: string }[] }[] }[];
}

/**
 * Synoptic answers are stored as field and option ids (`procedure`,
 * `procedure_opt_3`). The log keeps what a pathologist would read: the
 * field's label and the option's label, as the template worded them when
 * the change was saved. `templatesByInstanceLabel` maps each report
 * instance's path label (its template name) to its template.
 */
export function labelSynopticChanges(
  changes: ReportFieldChange[],
  templatesByInstanceLabel: Map<string, SynopticLabelSource>,
): ReportFieldChange[] {
  return changes.map(c => {
    if (c.path[0] !== 'synopticReports' || c.path[2] !== 'answers' || c.path.length < 4) return c;
    const template = templatesByInstanceLabel.get(c.path[1]);
    if (!template) return c;
    const field = template.sections.flatMap(s => s.fields).find(f => f.id === c.path[3]);
    if (!field) return c;
    const options = new Map((field.options ?? []).map(o => [o.id, o.label]));
    const label = (v: string | null) => v === null ? null : v.split(', ').map(id => options.get(id) ?? id).join(', ');
    return { ...c, path: [c.path[0], c.path[1], field.label, ...c.path.slice(4)], before: label(c.before), after: label(c.after) };
  });
}
